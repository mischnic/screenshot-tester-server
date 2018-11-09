#!/usr/bin/env mongo
use sts
db.createUser({
	user: "sts",
	pwd: "...",
	roles: [{
		role: "readWrite", db: "sts"
	}]
})
