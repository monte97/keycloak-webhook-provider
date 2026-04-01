.PHONY: up down restart logs logs-setup logs-generator status urls clean help

# ============================================================
# keycloak-webhook-provider — demo stack
# Run from this directory: make <target>
# ============================================================

## up              Start the full demo stack (detached)
up:
	docker compose up --build -d

## down            Stop and remove containers (keep volumes)
down:
	docker compose down

## restart         Full teardown (volumes included) and fresh start
restart:
	docker compose down -v
	docker compose up -d

## logs            Follow all container logs
logs:
	docker compose logs -f

## logs-setup      Show setup container output (contains URLs and UUID)
logs-setup:
	docker compose logs setup

## logs-generator  Follow generator loop output
logs-generator:
	docker compose logs -f generator

## status          Show container status
status:
	docker compose ps

## urls            Print the demo URLs (re-reads setup logs)
urls:
	@docker compose logs setup 2>/dev/null | grep -E 'http://localhost'

## clean           Teardown and remove all volumes (full reset)
clean:
	docker compose down -v

## help            Show available targets
help:
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/^## /  make /'
