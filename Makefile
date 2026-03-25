.PHONY: compile test test-unit test-integration test-mutation package clean \
       openapi-lint openapi-bundle openapi-html openapi-diff help

# ============================================================
# Configuration
# ============================================================

JAR_NAME := keycloak-webhook-provider-1.0.0-SNAPSHOT.jar
JAR := target/$(JAR_NAME)
DOCKER_IMAGE := keycloak-webhook-provider-build
DOCKER_RUN := docker run --rm -v "$(CURDIR)":/build -w /build
UID := $(shell id -u)
GID := $(shell id -g)
FIX_OWNER = @$(DOCKER_RUN) alpine chown -R $(UID):$(GID) target/ webhook-ui/node/ 2>/dev/null || true

OPENAPI_SPEC := docs/openapi.yaml
OPENAPI_BUNDLE := docs/openapi-bundled.yaml
OPENAPI_HTML := docs/openapi.html

# Build mode: "docker" (default, portable) or "local" (requires Java 17 + Maven)
BUILD ?= docker

ifeq ($(BUILD),local)
  JAVA_HOME_17 := $(HOME)/.sdkman/candidates/java/17.0.0-tem
  MVN := JAVA_HOME=$(JAVA_HOME_17) mvn
else
  MVN_IMAGE := maven:3.9-eclipse-temurin-17
  MVN := $(DOCKER_RUN) -v mvn-cache:/root/.m2 $(MVN_IMAGE) mvn
endif

# ============================================================
# Build
# ============================================================

## Compile sources (Java + webhook-ui)
compile:
	$(MVN) compile
	$(FIX_OWNER)

## Build fat JAR (skip all tests)
package:
	$(MVN) package -DskipTests
	$(FIX_OWNER)
	@echo ">>> JAR: $(JAR)"
	@ls -lh $(JAR)

## Remove build artifacts
clean:
	$(MVN) clean

# ============================================================
# Test
# ============================================================

## Run unit tests only (*Test.java)
test-unit:
	$(MVN) test

## Run integration tests (Testcontainers — requires Docker)
test-integration:
ifeq ($(BUILD),local)
	$(MVN) verify -Dmaven.surefire.skip=true
else
	$(DOCKER_RUN) -v /var/run/docker.sock:/var/run/docker.sock -v mvn-cache:/root/.m2 $(MVN_IMAGE) mvn verify -Dmaven.surefire.skip=true
endif

## Run all tests (unit + integration)
test:
ifeq ($(BUILD),local)
	$(MVN) verify
else
	$(DOCKER_RUN) -v /var/run/docker.sock:/var/run/docker.sock -v mvn-cache:/root/.m2 $(MVN_IMAGE) mvn verify
endif

## Run mutation testing with Pitest (unit tests only)
test-mutation:
	$(MVN) test pitest:mutationCoverage
	@echo ">>> Report: target/pit-reports/index.html"

# ============================================================
# OpenAPI
# ============================================================

## Lint and validate the OpenAPI spec
openapi-lint:
	@echo ">>> Validating $(OPENAPI_SPEC)..."
ifeq ($(BUILD),local)
	npx --yes @redocly/cli@latest lint $(OPENAPI_SPEC)
else
	$(DOCKER_RUN) node:20-slim npx --yes @redocly/cli@latest lint $(OPENAPI_SPEC)
endif

## Bundle the spec into a single resolved file
openapi-bundle:
	@echo ">>> Bundling $(OPENAPI_SPEC)..."
ifeq ($(BUILD),local)
	npx --yes @redocly/cli@latest bundle $(OPENAPI_SPEC) -o $(OPENAPI_BUNDLE)
else
	$(DOCKER_RUN) node:20-slim npx --yes @redocly/cli@latest bundle $(OPENAPI_SPEC) -o $(OPENAPI_BUNDLE)
endif
	@echo ">>> Output: $(OPENAPI_BUNDLE)"

## Generate HTML documentation from the spec
openapi-html:
	@echo ">>> Generating HTML docs..."
ifeq ($(BUILD),local)
	npx --yes @redocly/cli@latest build-docs $(OPENAPI_SPEC) -o $(OPENAPI_HTML)
else
	$(DOCKER_RUN) node:20-slim npx --yes @redocly/cli@latest build-docs $(OPENAPI_SPEC) -o $(OPENAPI_HTML)
endif
	@echo ">>> Output: $(OPENAPI_HTML)"

## Check spec/code drift: verify every JAX-RS endpoint has a matching path in openapi.yaml
openapi-diff:
	@echo ">>> Checking spec/code alignment..."
	@JAVA_ENDPOINTS=$$(grep -E '@(GET|POST|PUT|DELETE|PATCH)' src/main/java/dev/montell/keycloak/resources/WebhooksResource.java \
		| grep -v '//' | grep -v '"ui' | wc -l); \
	SPEC_OPERATIONS=$$(grep -cE '^\s+(get|post|put|delete|patch):$$' $(OPENAPI_SPEC)); \
	echo "  JAX-RS endpoints: $$JAVA_ENDPOINTS"; \
	echo "  OpenAPI operations: $$SPEC_OPERATIONS"; \
	if [ "$$JAVA_ENDPOINTS" != "$$SPEC_OPERATIONS" ]; then \
		echo "  WARNING: count mismatch — spec may be out of sync with code"; \
		exit 1; \
	else \
		echo "  OK: counts match"; \
	fi

## Show available targets
help:
	@echo "Usage: make <target> [BUILD=docker|local]"
	@echo ""
	@echo "  BUILD=docker (default) — runs everything in containers, no local deps needed"
	@echo "  BUILD=local            — uses local Java 17 (sdkman) + Maven + Node"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/^## /  /'
