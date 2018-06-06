const { send, sendError, json, buffer, text } = require("micro");
const { upload, move } = require("micro-upload");
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

function generateBody(id, files) {
	files = files.map(
		v => (v.indexOf(DOMAIN) == -1 ? `${DOMAIN}/${id}/${v}.png` : v)
	);

	return `\
<!--
${JSON.stringify(files)}
-->
# screenshot-tester report

${files.map(v => `![](${v})`).join("\n")}

*This comment was created automatically by screenshot-tester-server.*`;
}

async function updateComment(id, url, files) {
	return github("PATCH", url, generateBody(id, files));
}

function comment(repo, issue, files) {
	return github(
		"POST",
		`https://api.github.com/repos/${repo}/issues/${issue}/comments`,
		generateBody(`${repo}/${issue}`, files)
	);
}

const regexPOST = /\/([\w-]+\/[\w-]+)\/([0-9]+)/;
const regexGET = /\/([\w-]+\/[\w-]+\/[0-9]+)\/([\w-.]+)\.png/;

module.exports = upload(async (req, res) => {
	if (collection) {
		if (req.method == "POST") {
			const match = req.url.match(regexPOST);
			if (match && req.files) {
				const [_, repo, issue] = match;
				const id = `${repo}/${issue}`;

				let doc = { files: {}, id };
				for (let file of Object.keys(req.files)) {
					await move(req.files[file], "/tmp/sts_temp");

					const fileData = await fs.readFile("/tmp/sts_temp");
					doc.files[file] = Binary(fileData);
				}

				const oldDoc = await collection.findOne({ id });
				if (oldDoc && oldDoc.comment_url) {
					doc = {
						...oldDoc,
						...doc,
						files: { ...oldDoc.files, ...doc.files }
					};
					const files = [
						...Object.keys(oldDoc.files),
						...Object.keys(req.files)
					];

					await updateComment(id, oldDoc.comment_url, files);
					await collection.findOneAndReplace({ id }, doc, {
						upsert: true
					});
				} else {
					const { url: comment_url } = await comment(
						repo,
						issue,
						Object.keys(req.files)
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
				const [_, id, file] = match;

				const doc = await collection.findOne({
					id
				});
				if (!doc) {
					return send(res, 404);
				}
				if (doc && doc.files[file] && doc.files[file].buffer) {
					res.setHeader("Content-Type", "image/png");
					return send(res, 200, doc.files[file].buffer);
				} else {
					return send(res, 500);
				}
			}
		}
	}

	return send(res, 400);
});
