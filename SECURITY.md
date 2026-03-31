# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Older releases | ❌ |

Security fixes are applied to the latest release only.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report vulnerabilities through one of the following channels:

- **GitHub Private Vulnerability Reporting**: use the [Report a vulnerability](../../security/advisories/new) button in the Security tab of this repository
- **Email**: [francesco@montelli.dev](mailto:francesco@montelli.dev) — include `[SECURITY]` in the subject line

### What to include

- Description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- Affected versions
- Any suggested fix, if available

## Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 7 days |
| Fix or mitigation | Within 90 days (critical issues prioritised) |
| Public disclosure | Coordinated after fix is available |

If a fix requires more than 90 days, we will communicate the delay and provide a mitigation in the meantime.

## Coordinated Disclosure

We follow a **coordinated vulnerability disclosure** policy. We ask that you:

1. Give us reasonable time to assess and fix the issue before public disclosure
2. Avoid exploiting the vulnerability beyond what is needed to demonstrate it
3. Avoid accessing or modifying data that does not belong to you

We commit to:

1. Acknowledging your report promptly
2. Keeping you informed of progress
3. Crediting you in the security advisory (unless you prefer to remain anonymous)

## Scope

This policy applies to the `keycloak-webhook-provider` codebase and its released artifacts. It does not cover third-party dependencies — please report those directly to their maintainers.

## Out of Scope

- Vulnerabilities in Keycloak itself — report to [Keycloak Security](https://www.keycloak.org/security.html)
- Issues in environments where the provider is deployed (configuration, infrastructure)
- Theoretical vulnerabilities without a realistic attack scenario
