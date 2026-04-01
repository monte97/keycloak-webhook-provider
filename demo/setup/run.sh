#!/bin/sh
set -e

KC_URL="http://keycloak:8080"
CONSUMER_URL="http://consumer:8080"

echo "==> Creating webhook-tester session..."
SESSION=$(curl -sf -X POST "${CONSUMER_URL}/api/session" \
  -H "Content-Type: application/json" \
  -d '{}')
UUID=$(echo "$SESSION" | grep -o '"uuid":"[^"]*"' | cut -d'"' -f4)

if [ -z "$UUID" ]; then
  echo "ERROR: failed to create webhook-tester session"
  exit 1
fi
echo "    Session UUID: $UUID"

echo "==> Getting Keycloak admin token..."
TOKEN=$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=${KC_ADMIN_PASSWORD}&grant_type=password" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: failed to get Keycloak admin token"
  exit 1
fi

echo "==> Registering webhook in Keycloak (realm: ${KC_REALM})..."
curl -sf -X POST "${KC_URL}/realms/${KC_REALM}/webhooks/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${CONSUMER_URL}/${UUID}\",
    \"secret\": \"demo-secret\",
    \"enabled\": true,
    \"eventTypes\": [\"*\"]
  }" > /dev/null

echo ""
echo "============================================"
echo " Demo stack is ready!"
echo "============================================"
echo " Keycloak Admin:    http://localhost:${KEYCLOAK_PORT}  (admin / ${KC_ADMIN_PASSWORD})"
echo " Webhook Admin UI:  http://localhost:${KEYCLOAK_PORT}/realms/${KC_REALM}/webhooks/ui"
echo " Webhook Inspector: http://localhost:${CONSUMER_PORT}/${UUID}"
echo "============================================"
