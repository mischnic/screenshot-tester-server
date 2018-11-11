.PHONY: start dev down dev-local-db dev-local-db-stop dev-local

start:
	docker-compose up --build -d

down:
	docker-compose down

dev: down
	docker-compose up --build

local-db: down
	docker run --name sts-db --rm -v $(realpath ./mongodb):/data/db -p 27017:27017 -d mongo

local-db-stop:
	docker stop sts-db

local:
	env $(shell cat .env | sed -e 's-@mongo/-@localhost/-' -e's-sts.mischnic.ml-localhost:3000-' | xargs) yarn dev
