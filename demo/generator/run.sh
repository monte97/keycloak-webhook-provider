#!/bin/sh

KC_URL="http://keycloak:8080"

get_admin_token() {
  curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli&username=admin&password=${KC_ADMIN_PASSWORD}&grant_type=password" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4
}

random_suffix() {
  # generate a short random hex string
  head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

run_cycle() {
  TOKEN=$(get_admin_token)
  if [ -z "$TOKEN" ]; then
    echo "[generator] WARN: could not get admin token, skipping cycle"
    return
  fi

  i=0
  while [ "$i" -lt "$GENERATOR_USERS_PER_CYCLE" ]; do
    SUFFIX=$(random_suffix)
    USERNAME="${GENERATOR_USER_PREFIX}-${SUFFIX}"
    EMAIL="${USERNAME}@demo.local"

    # 1. Create user  →  admin.USER-CREATE
    USER_ID=$(curl -sf -X POST \
      "${KC_URL}/admin/realms/${KC_REALM}/users" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"enabled\":true}" \
      -D - | grep -i '^location:' | sed 's|.*/||' | tr -d '\r')

    if [ -z "$USER_ID" ]; then
      echo "[generator] WARN: could not create user ${USERNAME}"
      i=$((i + 1))
      continue
    fi
    echo "[generator] created user ${USERNAME} (${USER_ID})"

    # 2. Set password  →  admin.USER-UPDATE
    curl -sf -X PUT \
      "${KC_URL}/admin/realms/${KC_REALM}/users/${USER_ID}/reset-password" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"type":"password","value":"demo-pass","temporary":false}' > /dev/null

    # 3. Login via ROPC  →  access.LOGIN
    TOKENS=$(curl -sf -X POST \
      "${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token" \
      -d "client_id=demo-client&username=${USERNAME}&password=demo-pass&grant_type=password")
    REFRESH=$(echo "$TOKENS" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)
    echo "[generator] login: ${USERNAME}"

    # 4. Update email  →  admin.USER-UPDATE
    curl -sf -X PUT \
      "${KC_URL}/admin/realms/${KC_REALM}/users/${USER_ID}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"updated-${EMAIL}\"}" > /dev/null

    # 5. Logout via token revocation  →  access.LOGOUT
    if [ -n "$REFRESH" ]; then
      curl -sf -X POST \
        "${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/revoke" \
        -d "client_id=demo-client&token=${REFRESH}&token_type_hint=refresh_token" > /dev/null
      echo "[generator] logout: ${USERNAME}"
    fi

    # 6. Delete user  →  admin.USER-DELETE
    curl -sf -X DELETE \
      "${KC_URL}/admin/realms/${KC_REALM}/users/${USER_ID}" \
      -H "Authorization: Bearer $TOKEN" > /dev/null
    echo "[generator] deleted user ${USERNAME}"

    i=$((i + 1))
  done
}

echo "[generator] starting — interval=${GENERATOR_INTERVAL_SECONDS}s, users_per_cycle=${GENERATOR_USERS_PER_CYCLE}"

while true; do
  run_cycle
  echo "[generator] sleeping ${GENERATOR_INTERVAL_SECONDS}s..."
  sleep "$GENERATOR_INTERVAL_SECONDS"
done
