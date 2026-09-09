.PHONY: help up down logs seed demo migrate revision test lint fmt shell psql clean reset

help:
	@echo "BHUMI — make targets"
	@echo "  up        Start the full stack (docker compose)"
	@echo "  down      Stop the stack"
	@echo "  logs      Tail all logs"
	@echo "  migrate   Apply database migrations"
	@echo "  revision  Create a new migration (m=\"message\")"
	@echo "  seed      Load jurisdiction master, roles, demo users, sample docs"
	@echo "  demo      Run the pipeline over the seeded sample batch"
	@echo "  test      Run backend + frontend tests"
	@echo "  lint      ruff + mypy + eslint + tsc"
	@echo "  fmt       Format everything"
	@echo "  psql      Open a psql shell"
	@echo "  reset     Destroy volumes and rebuild from scratch"

up:
	docker compose up -d --build
	@echo ""
	@echo "  Web        http://localhost:3000"
	@echo "  API docs   http://localhost:8000/api/docs"
	@echo "  GraphQL    http://localhost:8000/api/graphql"
	@echo "  MinIO      http://localhost:9001"
	@echo "  Mail       http://localhost:8025"

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate:
	docker compose exec api alembic upgrade head

revision:
	docker compose exec api alembic revision --autogenerate -m "$(m)"

seed:
	docker compose exec api python -m bhumi.scripts.seed

demo:
	docker compose exec api python -m bhumi.scripts.run_demo

test:
	docker compose exec api pytest -q
	cd apps/web && npm run test --if-present

lint:
	docker compose exec api ruff check bhumi
	docker compose exec api mypy bhumi --ignore-missing-imports
	cd apps/web && npm run lint

fmt:
	docker compose exec api ruff format bhumi
	cd apps/web && npm run format --if-present

psql:
	docker compose exec postgres psql -U bhumi -d bhumi

shell:
	docker compose exec api python

clean:
	docker compose down -v

reset: clean up
	@sleep 12
	$(MAKE) seed
