#!/bin/sh
set -e
: "${API_SECRET:?API_SECRET env var required}"

echo "Starting nginx on :8080 (routes /vless → :18080, /vmess → :18081)..."
nginx

echo "Starting Xray manager..."
exec python3 /app/manage.py
