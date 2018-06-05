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
			console.error(error);
		} else {
			console.log("Connected successfully to server");

			const db = client.db(dbName);
			collection = db.collection("images");
		}
	}
);

async function comment(repo, issue, files) {
	const body = `\
# screenshot-tester report

${files
		.map(v => `${DOMAIN}/${repo}/${issue}/${v}.png`)
		.map(v => `![](${v})`)
		.join("\n")}`;

	return await request({
		method: "POST",
		auth: {
			user: "mischnic",
			pass: TOKEN
		},
		headers: {
			"User-Agent": "mischnic - screenshot-tester-server"
		},
		uri: `https://api.github.com/repos/${repo}/issues/${issue}/comments`,
		json: {
			body
		}
	});
}

const regexPOST = /\/([\w-]+\/[\w-]+)\/([0-9]+)/;
const regexGET = /\/([\w-]+\/[\w-]+)\/([0-9]+)\/([\w-.]+)\.png/;

module.exports = upload(async (req, res) => {
	if (collection) {
		if (req.method == "POST") {
			const match = req.url.match(regexPOST);
			if (match && req.files) {
				const [_, repo, issue] = match;
				const id = `${repo}/${issue}`;

				const doc = { id };
				for (let file of Object.keys(req.files)) {
					await move(req.files[file], "/tmp/sts_temp");

					const fileData = await fs.readFile("/tmp/sts_temp");
					doc[file] = Binary(fileData);
				}
				await collection.findOneAndReplace({ id }, doc, {
					upsert: true
				});
				await comment(repo, issue, Object.keys(req.files));
				return send(res, 200);
			}
		} else if (req.method == "GET") {
			const match = req.url.match(regexGET);
			if (match) {
				const [_, repo, issue, file] = match;

				const doc = await collection.findOne({
					id: `${repo}/${issue}`
				});
				if (doc[file] && doc[file].buffer) {
					res.setHeader("Content-Type", "image/png");
					return send(res, 200, doc[file].buffer);
				}
			}
		}
	}

	return send(res, 400);
});
