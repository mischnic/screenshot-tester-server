#!/usr/bin/env mongo
use sts
db.createUser({
	user: "sts",
	pwd: "...",
	roles: [{
		role: "readWrite", db: "sts"
	}]
})

db.createCollection("images")

db.images.createIndex({ id: -1 }, { unique: true })
