#!/bin/sh
set -e

# Railway sets $PORT automatically. Default fallback for local testing.
PORT="${PORT:-8080}"
PROTOCOL="${XRAY_PROTOCOL:-vless}"
UUID="${XRAY_UUID:?XRAY_UUID env var is required}"
WSPATH="${XRAY_WSPATH:-/default}"

echo "Starting Xray | protocol=$PROTOCOL port=$PORT path=$WSPATH"

sed \
  -e "s#__PORT__#${PORT}#g" \
  -e "s#__PROTOCOL__#${PROTOCOL}#g" \
  -e "s#__UUID__#${UUID}#g" \
  -e "s#__WSPATH__#${WSPATH}#g" \
  /etc/xray/config.template.json > /etc/xray/config.json

exec xray run -c /etc/xray/config.json
