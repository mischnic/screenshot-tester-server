const { send, sendError, json, buffer, text } = require("micro");
const { upload, move } = require("micro-upload");
const query = require("micro-query");
const request = require("request-promise-native");
const { MongoClient, Binary } = require("mongodb");
const fs = require("fs").promises;

const { TOKEN, DB_URL, DOMAIN } = process.env;
const dbName = "screenshot-tester-server";

let collection;

MongoClient.connect(
	DB_URL,
	function(err, client) {
		if (err) {
			console.error(err);
		} else {
			console.log("Connected successfully to server");

			const db = client.db(dbName);
			collection = db.collection("images");
		}
	}
);

const github = (method, url, body = undefined) =>
	request({
		method: method,
		auth: {
			user: "mischnic",
			pass: TOKEN
		},
		headers: {
			"User-Agent": "mischnic - screenshot-tester-server",
			Accept: "application/json"
		},
		uri: url,
		json: {
			body: body
		}
	});

const regexExtensionFromDB = /_(html|png)$/;

const makeURL = (id, v) =>
	v.indexOf(DOMAIN) == -1
		? `${DOMAIN}/${id}/${v.replace(regexExtensionFromDB, ".$1")}`
		: v;

function generateBody(id, images, failed) {
	let index;
	images = images.reduce((acc, [test, f, type]) => {
		if (test) {
			acc[test] = { ...(acc[test] || {}), [type]: f };
		} else {
			index = f;
		}
		return acc;
	}, {});

	const failedTestsK = Object.keys(images).filter(
		k => failed.indexOf(k) != -1
	);

	// <!--
	// ${JSON.stringify(files)}
	// -->
	return `\
# screenshot-tester report

${index ? `[Overview](${makeURL(id, index)})` : ""}

${
		failedTestsK.length > 0
			? `
Failed tests (click on result to see difference):

| Reference               |  Result                 |
|-------------------------|-------------------------|
${failedTestsK
					.map(k => {
						const { ref, res, diff } = images[k];
						return `![](${makeURL(id, ref)}) | ![[](${makeURL(
							id,
							diff
						)})](${makeURL(id, res)})`;
					})
					.join("\n")}
`
			: "All tests passed"
	}

<summary>Passed tests:</summary>
<details>
<table>
	<tr>
		<td>Reference</td>
		<td>Result</td>
	</tr>

${Object.keys(images)
		.filter(k => failed.indexOf(k) == -1)
		.map(k => {
			const { ref, res, diff } = images[k];
			return `<tr><td><img src="${makeURL(
				id,
				ref
			)}"></td><td><img src="${makeURL(id, res)}"></td></tr>`;
		})
		.join("\n")}
</table>
</details>
<br>

*This comment was created automatically by screenshot-tester-server.*`;
}

async function updateComment(id, url, images, failed) {
	return github("PATCH", url, generateBody(id, images, failed));
}

function comment(repo, issue, images, failed) {
	return github(
		"POST",
		`https://api.github.com/repos/${repo}/issues/${issue}/comments`,
		generateBody(`${repo}/${issue}`, images, failed)
	);
}

const regexPOST = /\/([\w-]+\/[\w-]+)\/([0-9]+)/;
const regexGET = /\/([\w-]+\/[\w-]+\/[0-9]+)\/([\w-.\/]+)/;

module.exports = upload(async (req, res) => {
	const { failed = [], os } = query(req);

	if (collection) {
		if (req.method == "POST") {
			const match = req.url.match(regexPOST);
			if (match && req.files) {
				const [_, repo, issue] = match;
				const id = `${repo}/${issue}`;

				let doc = { files: {}, data: [], id };
				for (let file of Object.keys(req.files)) {
					const [_, dst, __] = file.split(":");

					if (Array.isArray(req.files[file])) {
						throw new Error("Duplicate file: " + file);
					}
					await move(req.files[file], "/tmp/sts_temp");

					const fileData = await fs.readFile("/tmp/sts_temp");
					doc.files[dst.replace(/\./g, "_")] = Binary(fileData);
					doc.data.push(file);
				}

				const oldDoc = await collection.findOne({ id });
				if (oldDoc && oldDoc.comment_url) {
					doc = {
						...oldDoc,
						...doc,
						files: { ...oldDoc.files, ...doc.files },
						data: [...oldDoc.data, ...doc.data].filter(
							(elem, pos, arr) => arr.indexOf(elem) == pos
						)
					};
					await updateComment(
						id,
						oldDoc.comment_url,
						doc.data.map(v => v.split(":")),
						failed
					);
					await collection.findOneAndReplace({ id }, doc, {
						upsert: true
					});
				} else {
					const { url: comment_url } = await comment(
						repo,
						issue,
						Object.keys(req.files).map(v => v.split(":")),
						failed
					);
					doc.comment_url = comment_url;

					await collection.findOneAndReplace({ id }, doc, {
						upsert: true
					});
				}

				return send(res, 200);
			}
		} else if (req.method == "GET") {
			const match = req.url.match(regexGET);
			if (match) {
				let [_, id, file] = match;

				file = file.replace(/\./g, "_");

				const doc = await collection.findOne({
					id
				});
				if (!doc) {
					return send(res, 404);
				}
				if (doc && doc.files[file] && doc.files[file].buffer) {
					if (file.endsWith("_html")) {
						res.setHeader(
							"Content-Type",
							"text/html; charset=utf-8"
						);
					} else {
						res.setHeader("Content-Type", "image/png");
					}
					return send(res, 200, doc.files[file].buffer);
				} else {
					return send(res, 500);
				}
			}
		}
	}

	return send(res, 400);
});
