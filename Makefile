.PHONY: types api web test lint

types:
	cd web && npx openapi-typescript http://localhost:47131/openapi.json -o src/lib/api-types.ts

api:
	docker compose up -d api

web:
	docker compose up -d web

test:
	.venv/bin/pytest -q && cd web && npm test

lint:
	.venv/bin/ruff check app tests && cd web && npm run lint
