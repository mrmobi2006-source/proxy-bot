#!/bin/sh
set -e
: "${API_SECRET:?API_SECRET env var required}"
exec python3 /app/manage.py
