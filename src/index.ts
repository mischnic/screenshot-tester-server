import { send, sendError, json, buffer, text } from "micro";
import FileRequest, { upload, move } from "micro-upload";
import query from "micro-query";
import { IncomingMessage, ServerResponse } from "http";
import mongodb, { MongoClient, Binary } from "mongodb";
import micro from "micro";
import { readFileSync, promises as fs } from "fs";

import {
	commitExists,
	commentExists,
	updateComment,
	makeComment
} from "./github";
import { makeURL, translatePlatform, sort } from "./comment";

import { DataDocument, FileDescription, FileDescriptionType } from "./types";

const { GH_USER, GH_TOKEN, DB_URL, DOMAIN } = process.env;
const dbName = "sts";

const HOMEPAGE = readFileSync("./test.html");

// const WHITELIST_IP = [
// 	// AppVeyor
// 	"80.109.227.78",
// 	"74.205.54.20",
// 	"104.197.110.30",
// 	"104.197.145.181",
// 	"146.148.85.29",
// 	"67.225.139.254",
// 	"67.225.138.82",
// 	"67.225.139.144",
// 	// local
// 	"::1",
// 	"127.0.0.1",
// 	"::ffff:127.0.0.1" // ???
// 	// Travis ...
// ];

// Request.get("https://dnsjson.com/nat.travisci.net/A.json").then(v => {
// 	WHITELIST_IP.push(...JSON.parse(v).results.records);
// });

let collection: mongodb.Collection;
MongoClient.connect(
	DB_URL,
	{ useNewUrlParser: true },
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

//
const regexPostData = /^\/([\w-]+\/[\w-]+)\/([a-f0-9]+)(?:\?.*)?$/;
const regexGetResource = /^\/([\w-]+\/[\w-]+\/[a-f0-9]+)\/[0-9a-f]+\/([\w-%]+)\/([\w-.\/%]+)$/;
const regexOverview = /^\/([\w-]+\/[\w-]+\/[a-f0-9]+)\/[0-9a-f]+\/?$/;
const regexCleanup = /^\/cleanup$/;

function checkPermission(repo: string) {
	return repo.startsWith("mischnic") || repo.startsWith("parro-it");
}

function isCommitSha(id: string) {
	return id.length === 40;
}

function findIndexFile(list: FileDescription[]): string {
	const index = list.find(({ path }) => path.endsWith("index.html"));
	if (index) {
		return index.path;
	} else {
		return null;
	}
}

function getClientIp(req: any) {
	return (
		(
			req.headers["X-Forwarded-For"] ||
			req.headers["x-forwarded-for"] ||
			""
		).split(",")[0] || req.client.remoteAddress
	);
}

interface QueryOptions {
	failed: string[] | string;
	os: string;
}

const handler = upload(async (req, res) => {
	const q = query(req);

	const failed = Array.isArray(q.failed) ? q.failed : [q.failed];
	const os: string = Array.isArray(q.os) ? q.os[0] : q.os;

	if (collection) {
		if (req.method == "POST") {
			// if (WHITELIST_IP.indexOf(getClientIp(req)) == -1) {
			// 	console.error(
			// 		"IP blocked (not whitelisted) - " + getClientIp(req)
			// 	);
			// 	return send(res, 403);
			// }

			let match = req.url.match(regexPostData);
			// /mischnic/screenshot-tester/2?os=darwin&failed=core-api
			if (match && os) {
				const [_, repo, issue] = match;
				if (!checkPermission(repo)) {
					console.error("Not allowed - " + repo);
					return send(res, 403);
				}

				const isCommit = isCommitSha(issue);

				const id = `${repo}/${issue}`;

				let doc: DataDocument = {
					files: { [os]: {} },
					data: { [os]: [] },
					id,
					failed: { [os]: failed },
					comment_url: ""
				};
				for (let [file, v] of Object.entries(req.files || {})) {
					const [name, path, type] = file.split(":");

					if (Array.isArray(v)) {
						throw new Error("Duplicate file: " + file);
					}
					if (!path) {
						return send(res, 400);
					}

					await move(v, "/tmp/sts_temp");

					const fileData = await fs.readFile("/tmp/sts_temp");
					doc.files[os][path.replace(/\./g, "_")] = new Binary(
						fileData
					);
					doc.data[os].push({
						name,
						path,
						type: <any>type
					});
				}

				const oldDoc = <DataDocument>await collection.findOne({ id });
				if (
					oldDoc &&
					(isCommit || (await commentExists(oldDoc.comment_url)))
				) {
					// append images and update comment to contain all
					doc = {
						...oldDoc,
						files: { ...oldDoc.files, ...doc.files },
						data: { ...oldDoc.data, ...doc.data },
						failed: { ...oldDoc.failed, ...doc.failed }
					};

					if (!isCommit)
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
					if (!isCommit) {
						const { url: comment_url } = await makeComment(
							repo,
							issue,
							doc.data,
							doc.failed
						);
						doc.comment_url = comment_url;
					}

					await collection.insertOne(doc);
				}

				if (isCommit) {
					const index = findIndexFile(doc.data[os]);
					if (index)
						return send(res, 200, makeURL(id, index, "0", os));
					else return send(res, 200);
				} else return send(res, 200);
			} else if ((match = req.url.match(regexCleanup))) {
				// /cleanup
				Promise.resolve().then(async () => {
					console.log("[Cleanup] Start");
					const results = <DataDocument[]>(
						await collection.find().toArray()
					);

					for (let x of results) {
						const lastSlash = x.id.lastIndexOf("/");
						const repo = x.id.substr(0, lastSlash),
							id = x.id.substr(lastSlash + 1);
						if (isCommitSha(id)) {
							if (!(await commitExists(repo, id))) {
								await collection.deleteOne({ id: x.id });
								console.log("[Cleanup] removed commit ", x.id);
							}
						} else {
							if (!(await commentExists(x.comment_url))) {
								await collection.deleteOne({ id: x.id });
								console.log("[Cleanup] removed pr ", x.id);
							}
						}
					}
					console.log("[Cleanup] Finished");
				});

				return send(res, 200);
			}
		} else if (req.method == "GET") {
			let match = req.url.match(regexGetResource);
			// /mischnic/screenshot-tester/2/814b27604d7a/os/.../file.png

			if (match) {
				let [_, id, os, file] = match;

				os = decodeURI(os);
				file = decodeURI(file).replace(/\./g, "_");

				const doc = <DataDocument>await collection.findOne({
					id
				});

				if (!doc || !doc.files[os] || !doc.files[os][file]) {
					return send(res, 404);
				}

				if (doc.files[os][file].buffer) {
					res.setHeader(
						"Content-Type",
						file.endsWith("_html")
							? "text/html; charset=utf-8"
							: "image/png"
					);
					res.setHeader("Cache-Control", "public, max-age=1209600");

					return send(res, 200, doc.files[os][file].buffer);
				} else {
					console.error(req.url);
					console.error("missing buffer?");
					return send(res, 500);
				}
			} else if ((match = req.url.match(regexOverview))) {
				const [_, id] = match;

				const doc = <DataDocument>await collection.findOne({
					id
				});

				if (!doc || !doc.files) {
					return send(res, 404);
				}

				res.setHeader("Content-Type", "text/html; charset=utf-8");

				let output = `<html><body>`;
				Object.keys(doc.data)
					.sort(sort).reverse()
					.forEach(platform => {
						const files = doc.data[platform];
						const index = findIndexFile(files);
						if (index) {
							output += `<h3><a href="${makeURL(
								id,
								index,
								"0",
								platform
							)}">${translatePlatform(platform)}</a></h3>`;
						} else {
							output += `<h3>${translatePlatform(platform)}</h3>`;
						}
					});
				output += `</body></html>`;

				return send(res, 200, output);
			}

			res.setHeader("Content-Type", "text/html; charset=utf-8");
			return send(res, 200, HOMEPAGE);
		}
	} else {
		console.error("No db connection!");
		return send(res, 500);
	}

	return send(res, 400);
});

micro(handler).listen(process.env.PORT || 3000);
