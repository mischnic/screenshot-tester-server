.PHONY: start dev down

start:
	docker-compose up --build -d

down:
	docker-compose down

dev: down
	docker-compose up --build
