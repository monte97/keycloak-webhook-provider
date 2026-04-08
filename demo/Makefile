.PHONY: up down restart logs logs-setup logs-generator status urls clean help test-e2e check-encryption-key

# ============================================================
# keycloak-webhook-provider — demo stack
# Run from this directory: make <target>
# ============================================================

## check-encryption-key  Verify WEBHOOK_ENCRYPTION_KEY is set and valid (32-byte base64)
check-encryption-key:
	@if [ ! -f .env ]; then \
		echo "ERROR: demo/.env not found. Copy .env.example to .env first:"; \
		echo "  cp .env.example .env"; \
		exit 1; \
	fi
	@KEY=$$(grep -E '^WEBHOOK_ENCRYPTION_KEY=' .env | cut -d= -f2-); \
	if [ -z "$$KEY" ]; then \
		echo "ERROR: WEBHOOK_ENCRYPTION_KEY is not set in demo/.env"; \
		echo ""; \
		echo "The webhook provider encrypts HMAC secrets at rest and requires"; \
		echo "a 256-bit AES key. Generate one and add it to demo/.env:"; \
		echo ""; \
		echo "  echo \"WEBHOOK_ENCRYPTION_KEY=\$$(openssl rand -base64 32)\" >> .env"; \
		echo ""; \
		exit 1; \
	fi; \
	LEN=$$(printf '%s' "$$KEY" | base64 -d 2>/dev/null | wc -c); \
	if [ "$$LEN" != "32" ]; then \
		echo "ERROR: WEBHOOK_ENCRYPTION_KEY must decode to exactly 32 bytes (got $$LEN)"; \
		echo ""; \
		echo "Generate a fresh key:"; \
		echo "  openssl rand -base64 32"; \
		echo ""; \
		exit 1; \
	fi; \
	echo "WEBHOOK_ENCRYPTION_KEY: OK (32 bytes)"

## up              Start the full demo stack (detached)
up: check-encryption-key
	docker compose up --build -d

## down            Stop and remove containers (keep volumes)
down:
	docker compose down

## restart         Full teardown (volumes included) and fresh start
restart: check-encryption-key
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

## test-e2e        Run Playwright E2E suite (boots demo stack automatically)
test-e2e: check-encryption-key
	cd .. && npm --prefix e2e test
