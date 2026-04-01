#!/bin/sh
set -e

echo "Downloading latest keycloak-webhook-provider JAR..."
URL=$(curl -sf https://api.github.com/repos/monte97/keycloak-webhook-provider/releases/latest \
  | grep browser_download_url | grep '\.jar' | cut -d'"' -f4)

if [ -z "$URL" ]; then
  echo "ERROR: could not resolve JAR download URL"
  exit 1
fi

echo "Fetching: $URL"
curl -L -o /providers/keycloak-webhook-provider.jar "$URL"
echo "JAR downloaded successfully."
