#!/usr/bin/env python3
"""
Internal-only management API for the shared SSH server.
Not exposed publicly - only reachable via Railway's private network
(http://<service>.railway.internal:8081) from the bot service.

Endpoints:
  POST   /users   {"username": "...", "password": "..."}  -> create user
  DELETE /users/<username>                                 -> remove user

All requests must include header: X-API-Key: <API_SECRET env var>
"""

import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

API_SECRET = os.environ["API_SECRET"]  # required, no default - fail loudly if unset


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


class Handler(BaseHTTPRequestHandler):
    def _unauthorized(self):
        self.send_response(401)
        self.end_headers()
        self.wfile.write(b'{"error":"unauthorized"}')

    def _check_auth(self):
        return self.headers.get("X-API-Key") == API_SECRET

    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_POST(self):
        if not self._check_auth():
            return self._unauthorized()
        if self.path != "/users":
            return self._send_json(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
            username = body["username"]
            password = body["password"]
        except Exception:
            return self._send_json(400, {"error": "invalid body"})

        # Basic sanity check on username to avoid shell weirdness
        if not username.isalnum() or len(username) > 32:
            return self._send_json(400, {"error": "invalid username"})

        code, out, err = run(["adduser", "-D", "-s", "/bin/false", username])
        if code != 0 and "already exists" not in err:
            return self._send_json(500, {"error": f"adduser failed: {err}"})

        proc = subprocess.run(
            ["chpasswd"], input=f"{username}:{password}\n", text=True
        )
        if proc.returncode != 0:
            return self._send_json(500, {"error": "chpasswd failed"})

        return self._send_json(200, {"status": "created", "username": username})

    def do_DELETE(self):
        if not self._check_auth():
            return self._unauthorized()
        parts = self.path.strip("/").split("/")
        if len(parts) != 2 or parts[0] != "users":
            return self._send_json(404, {"error": "not found"})

        username = parts[1]
        if not username.isalnum() or len(username) > 32:
            return self._send_json(400, {"error": "invalid username"})

        code, out, err = run(["deluser", username])
        if code != 0 and "does not exist" not in err:
            return self._send_json(500, {"error": f"deluser failed: {err}"})

        return self._send_json(200, {"status": "deleted", "username": username})

    def log_message(self, format, *args):
        pass  # keep logs quiet - avoid leaking usernames/passwords into stdout


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8081), Handler)
    print("Management API listening on :8081")
    server.serve_forever()
