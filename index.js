const { send, sendError, json, buffer, text } = require("micro");
const { upload, move } = require("micro-upload");
const query = require("micro-query");
const request = require("request-promise-native");
const { MongoClient, Binary } = require("mongodb");
const crypto = require("crypto");
const fs = require("fs").promises;

const { GH_USER, GH_TOKEN, DB_URL, DOMAIN } = process.env;
const dbName = "screenshot-tester-server";

const translatePlatform = platform =>
	platform
		.replace(/^win/, "Windows ")
		.replace(/^darwin/, "macOS")
		.replace(/^linux/, "Linux");

const WHITELIST_IP = [
	// AppVeyor
	"80.109.227.78",
	"74.205.54.20",
	"104.197.110.30",
	"104.197.145.181",
	"146.148.85.29",
	"67.225.139.254",
	"67.225.138.82",
	"67.225.139.144",
	// local
	"::1",
	"127.0.0.1",
	"::ffff:127.0.0.1" // ???
	// Travis ...
];

request.get("https://dnsjson.com/nat.travisci.net/A.json").then(v => {
	WHITELIST_IP.push(...JSON.parse(v).results.records);
});

let collection;
MongoClient.connect(
	DB_URL,
	function(err, client) {
		if (err) {
			console.error(err);
		} else {
			console.log("Connected successfully to database");

			const db = client.db(dbName);
			collection = db.collection("images");
		}
	}
);

const github = (method, url, body = undefined) =>
	request({
		method: method,
		auth: {
			user: GH_USER,
			pass: GH_TOKEN
		},
		headers: {
			"User-Agent": "mischnic - screenshot-tester-server",
			Accept: "application/json"
		},
		url,
		json: {
			body: body
		}
	});

const regexExtensionFromDB = /_(html|png)$/;

const makeURL = (id, v, hash, os) =>
	v.indexOf(DOMAIN) == -1
		? `${DOMAIN}/${id}/${hash}/${os}/${v.replace(
				regexExtensionFromDB,
				".$1"
		  )}`
		: v;

async function commentExists(url) {
	try {
		await github("GET", url);
		return true;
	} catch (e) {
		return false;
	}
}

function generateBody(id, platformImages, failed, hash = "0") {
	return `\
# screenshot-tester report

(The *D* link in the rightmost column opens a diff)

${Object.entries(platformImages)
		.map(([platform, v]) => {
			const myFailed = failed[platform] || [];
			const os = translatePlatform(platform);
			let index;
			const images = v
				.map(v => v.split(":"))
				.reduce((acc, [test, file, type]) => {
					if (test) {
						acc[test] = { ...(acc[test] || {}), [type]: file };
					} else {
						index = file;
					}
					return acc;
				}, {});

			const failedTestsK = Object.keys(images).filter(
				k => myFailed.indexOf(k) !== -1
			);

			const general = `
## ${os}
${index ? `[Overview](${makeURL(id, index, hash, platform)})` : ""}

${
				failedTestsK.length > 0
					? `

Failed tests:

<table>
	<tr>
		<td>Reference</td>
		<td>Result</td>
	</tr>
${failedTestsK
							.map(k => {
								const { ref, res, diff } = images[k];
								return `<tr><td><img src="${makeURL(
									id,
									ref,
									hash,
									platform
								)}"></td><td><img src="${makeURL(
									id,
									res,
									hash,
									platform
								)}"></td><td><a target="_blank" href="${makeURL(
									id,
									diff,
									hash,
									platform
								)}">D</a></td></tr>`;
							})
							.join("\n")}
</table>`
					: `<b>All tests passed</b>`
			}`;

			return (
				general +
				`
<summary>Passed tests:</summary>
<details>
<table>
	<tr>
		<td>Reference</td>
		<td>Result</td>
	</tr>

${Object.keys(images)
					.filter(k => myFailed.indexOf(k) == -1)
					.map(k => {
						const { ref, res, diff } = images[k];
						return `<tr><td><img src="${makeURL(
							id,
							ref,
							hash,
							platform
						)}"></td><td><img src="${makeURL(
							id,
							res,
							hash,
							platform
						)}"></td><td><a target="_blank" href="${makeURL(
							id,
							diff,
							hash,
							platform
						)}">D</a></td></tr>`;
					})
					.join("\n")}
</table>
</details>`
			);
		})
		.join("\n")}
<br>

*This comment was created automatically by screenshot-tester-server.*`;
}

function updateComment(id, url, images, failed) {
	return github(
		"PATCH",
		url,
		generateBody(id, images, failed, crypto.randomBytes(6).toString("hex"))
	);
}

function comment(repo, issue, images, failed) {
	return github(
		"POST",
		`https://api.github.com/repos/${repo}/issues/${issue}/comments`,
		generateBody(`${repo}/${issue}`, images, failed)
	);
}

const regexPOST = /^\/([\w-]+\/[\w-]+)\/([0-9]+)(?:\?.*)?$/;
const regexGET = /^\/([\w-]+\/[\w-]+\/[0-9]+)\/[0-9a-f]+\/([\w]+)\/([\w-.\/]+)$/;

const checkPermission = v =>
	v.indexOf("mischnic") == 0 || v.indexOf("parro-it") == 0;

var getClientIp = function(req) {
	return (
		(
			req.headers["X-Forwarded-For"] ||
			req.headers["x-forwarded-for"] ||
			""
		).split(",")[0] || req.client.remoteAddress
	);
};

module.exports = upload(async (req, res) => {
	let { failed = [], os } = query(req);
	if (!Array.isArray(failed)) failed = [failed];

	if (collection) {
		if (req.method == "POST") {
			if (WHITELIST_IP.indexOf(getClientIp(req)) == -1) {
				console.error(
					"IP blocked (not whitelisted) - " + getClientIp(req)
				);
				return send(res, 403);
			}
			const match = req.url.match(regexPOST);
			// /mischnic/screenshot-tester/2?os=darwin&failed=core-api
			if (match && req.files) {
				const [_, repo, issue] = match;
				if (!checkPermission(repo)) {
					return send(res, 404);
				}

				const id = `${repo}/${issue}`;

				let doc = { files: { [os]: {} }, data: { [os]: [] }, id };
				for (let [file, v] of Object.entries(req.files)) {
					const [_, dst, __] = file.split(":");

					if (Array.isArray(v)) {
						throw new Error("Duplicate file: " + file);
					}
					await move(v, "/tmp/sts_temp");

					const fileData = await fs.readFile("/tmp/sts_temp");
					doc.files[os][dst.replace(/\./g, "_")] = Binary(fileData);
					doc.data[os].push(file);
				}
				doc.failed = { [os]: failed };

				const oldDoc = await collection.findOne({ id });
				if (
					oldDoc &&
					oldDoc.comment_url /* && await commentExists(oldDoc.comment_url)*/
				) {
					// append images and update comment to contain all
					doc = {
						...oldDoc,
						...doc,
						files: { ...oldDoc.files, ...doc.files },
						data: { ...oldDoc.data, ...doc.data },
						failed: { ...oldDoc.failed, ...doc.failed }
					};
					await updateComment(
						id,
						oldDoc.comment_url,
						doc.data,
						doc.failed
					);
					await collection.findOneAndReplace({ id }, doc, {
						upsert: true
					});
				} else {
					// create a new comment
					const { url: comment_url } = await comment(
						repo,
						issue,
						doc.data,
						failed
					);
					doc.comment_url = comment_url;

					await collection.insertOne(doc);
				}

				return send(res, 200);
			}
		} else if (req.method == "GET") {
			const match = req.url.match(regexGET);
			// /mischnic/screenshot-tester/2/814b27604d7a/os/.../file.png
			if (match) {
				let [_, id, os, file] = match;

				file = file.replace(/\./g, "_");

				const doc = await collection.findOne({
					id
				});
				if (!doc || !doc.files[os] || !doc.files[os][file]) {
					return send(res, 404);
				}
				if (
					doc &&
					doc.files[os] &&
					doc.files[os][file] &&
					doc.files[os][file].buffer
				) {
					if (file.endsWith("_html")) {
						res.setHeader(
							"Content-Type",
							"text/html; charset=utf-8"
						);
					} else {
						res.setHeader("Content-Type", "image/png");
					}
					return send(res, 200, doc.files[os][file].buffer);
				} else {
					return send(res, 500);
				}
			}
		}
	}

	return send(res, 400);
});
