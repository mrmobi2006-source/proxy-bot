#!/bin/sh
set -e

: "${API_SECRET:?API_SECRET is required}"
: "${XRAY_PROTOCOL:?XRAY_PROTOCOL is required}"

exec python3 /app/manage.py
