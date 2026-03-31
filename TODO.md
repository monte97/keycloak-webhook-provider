# TODO

## In progress

- [ ] README — rimuovere riferimenti a keycloak-kickstart e al servizio a pagamento; aggiungere contatti (LinkedIn, blog)

## Backlog

- [ ] CONTRIBUTING.md — guida per contributori esterni
- [ ] Chiudere PR #6 (SNAPSHOT post-release) o ignorarla — decidere politica

## Done

- [x] Fix: test payload hard-coded → Jackson-serialized AccessEvent
- [x] Fix: resend-failed si ferma al primo errore → continua fino a circuit breaker aperto
- [x] CI: Pitest mutation testing su push a master
- [x] Spotless (google-java-format AOSP) + SpotBugs enforced in CI
- [x] SECURITY.md
- [x] CHANGELOG.md
- [x] Versioning automatico con Release Please (conventional commits → Release PR → tag + JAR)
- [x] Pipeline CI unificata (un solo run per push)
- [x] Fix: openapi-diff esclude endpoint UI dal conteggio
- [x] Release v1.2.0
