import request from "request-promise-native";
import crypto from "crypto";

import { DataList, FailedList } from "./types";

const { GH_USER, GH_TOKEN } = process.env;

import generateBody from "./comment";

export function github(method: string, url: string, body?: any) {
	return request({
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
}

export async function commentExists(url: string) {
	try {
		await github("GET", url);
		return true;
	} catch (e) {
		return false;
	}
}

export function updateComment(
	id: string,
	url: string,
	images: DataList,
	failed: FailedList
) {
	return github(
		"PATCH",
		url,
		generateBody(id, images, failed, crypto.randomBytes(6).toString("hex"))
	);
}

export function makeComment(
	repo: string,
	issue: string,
	images: DataList,
	failed: FailedList
) {
	return github(
		"POST",
		`https://api.github.com/repos/${repo}/issues/${issue}/comments`,
		generateBody(`${repo}/${issue}`, images, failed)
	);
}

export async function commitExists(repo: string, sha: string) {
	try {
		await github(
			"GET",
			`https://api.github.com/repos/${repo}/commits/${sha}`
		);
		return true;
	} catch (e) {
		return false;
	}
}
