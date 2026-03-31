.PHONY: compile test test-unit test-integration test-mutation package clean \
       openapi-lint openapi-bundle openapi-html openapi-diff \
       fmt fmt-check spotbugs help

# ============================================================
# Configuration
# ============================================================

VERSION := $(shell sed -n 's/.*<version>\(.*\)<\/version>.*/\1/p' pom.xml | head -1)
JAR := target/keycloak-webhook-provider-$(VERSION).jar
DOCKER_RUN := docker run --rm -v "$(CURDIR)":/build -w /build
UID := $(shell id -u)
GID := $(shell id -g)
FIX_OWNER = @$(DOCKER_RUN) alpine chown -R $(UID):$(GID) target/ 2>/dev/null || true

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

## compile        Compile sources (Java + webhook-ui)
compile:
	$(MVN) compile
	$(FIX_OWNER)

## package        Build fat JAR (skip all tests)
package:
	$(MVN) package -DskipTests
	$(FIX_OWNER)
	@echo ">>> $(JAR)"
	@ls -lh $(JAR)

## clean          Remove build artifacts
clean:
	$(MVN) clean

# ============================================================
# Test
# ============================================================

## test-unit      Run unit tests only (*Test.java + UI)
test-unit:
	$(MVN) test

## test-integration  Run integration tests (Testcontainers, requires Docker)
test-integration:
ifeq ($(BUILD),local)
	$(MVN) verify -Dmaven.surefire.skip=true
else
	$(DOCKER_RUN) -v /var/run/docker.sock:/var/run/docker.sock -v mvn-cache:/root/.m2 $(MVN_IMAGE) mvn verify -Dmaven.surefire.skip=true
endif

## test           Run all tests (unit + integration)
test:
ifeq ($(BUILD),local)
	$(MVN) verify
else
	$(DOCKER_RUN) -v /var/run/docker.sock:/var/run/docker.sock -v mvn-cache:/root/.m2 $(MVN_IMAGE) mvn verify
endif

## test-mutation  Run mutation testing with Pitest
test-mutation:
	$(MVN) test pitest:mutationCoverage
	@echo ">>> Report: target/pit-reports/index.html"

# ============================================================
# Code quality
# ============================================================

## fmt            Apply google-java-format via Spotless
fmt:
	$(MVN) spotless:apply

## fmt-check      Check formatting (fails if unformatted)
fmt-check:
	$(MVN) spotless:check

## spotbugs       Run SpotBugs static analysis
spotbugs:
	$(MVN) compile spotbugs:check

# ============================================================
# OpenAPI
# ============================================================

## openapi-lint   Lint and validate the OpenAPI spec
openapi-lint:
	@echo ">>> Validating $(OPENAPI_SPEC)..."
ifeq ($(BUILD),local)
	npx --yes @redocly/cli@latest lint $(OPENAPI_SPEC)
else
	$(DOCKER_RUN) node:20-slim npx --yes @redocly/cli@latest lint $(OPENAPI_SPEC)
endif

## openapi-bundle Bundle the spec into a single resolved file
openapi-bundle:
	@echo ">>> Bundling $(OPENAPI_SPEC)..."
ifeq ($(BUILD),local)
	npx --yes @redocly/cli@latest bundle $(OPENAPI_SPEC) -o $(OPENAPI_BUNDLE)
else
	$(DOCKER_RUN) node:20-slim npx --yes @redocly/cli@latest bundle $(OPENAPI_SPEC) -o $(OPENAPI_BUNDLE)
endif
	@echo ">>> Output: $(OPENAPI_BUNDLE)"

## openapi-html   Generate HTML documentation from the spec
openapi-html:
	@echo ">>> Generating HTML docs..."
ifeq ($(BUILD),local)
	npx --yes @redocly/cli@latest build-docs $(OPENAPI_SPEC) -o $(OPENAPI_HTML)
else
	$(DOCKER_RUN) node:20-slim npx --yes @redocly/cli@latest build-docs $(OPENAPI_SPEC) -o $(OPENAPI_HTML)
endif
	@echo ">>> Output: $(OPENAPI_HTML)"

## openapi-diff   Check spec/code drift
openapi-diff:
	@echo ">>> Checking spec/code alignment..."
	@JAVA_ENDPOINTS=$$(grep -n -E '@(GET|POST|PUT|DELETE|PATCH)' src/main/java/dev/montell/keycloak/resources/WebhooksResource.java \
		| grep -v '//' \
		| awk -F: '{n=$$1+1; print n}' \
		| while read linenum; do sed -n "$${linenum}p" src/main/java/dev/montell/keycloak/resources/WebhooksResource.java; done \
		| grep -v '@Path("ui' \
		| wc -l); \
	SPEC_OPERATIONS=$$(grep -cE '^\s+(get|post|put|delete|patch):$$' $(OPENAPI_SPEC)); \
	echo "  JAX-RS endpoints: $$JAVA_ENDPOINTS"; \
	echo "  OpenAPI operations: $$SPEC_OPERATIONS"; \
	if [ "$$JAVA_ENDPOINTS" != "$$SPEC_OPERATIONS" ]; then \
		echo "  WARNING: count mismatch — spec may be out of sync with code"; \
		exit 1; \
	else \
		echo "  OK: counts match"; \
	fi

## help           Show available targets
help:
	@echo "Usage: make <target> [BUILD=docker|local]"
	@echo ""
	@echo "  BUILD=docker (default) — runs in containers, no local deps needed"
	@echo "  BUILD=local            — uses local Java 17 (sdkman) + Maven + Node"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/^## /  make /'
