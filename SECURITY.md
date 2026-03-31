# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.1.x   | :white_check_mark: |
| < 1.1   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue.**

Instead, email **security@montell.dev** with:

- A description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Any potential impact assessment

You will receive an acknowledgment within **48 hours** and a detailed response within **5 business days** indicating next steps.

## Scope

This policy covers the `keycloak-webhook-provider` JAR deployed as a Keycloak SPI plugin, including:

- REST API endpoints (`/realms/{realm}/webhooks/...`)
- HMAC signature generation and verification
- Webhook secret storage and handling
- JPA entity access and query construction
- Admin UI served at `/realms/{realm}/webhooks/ui`

## Disclosure Policy

Once a fix is available, we will:

1. Release a patched version
2. Publish a GitHub Security Advisory
3. Credit the reporter (unless they prefer anonymity)
