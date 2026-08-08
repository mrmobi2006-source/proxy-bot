#!/usr/bin/env python3
"""
Runs Xray with a dynamically-managed client list, and exposes an
internal-only HTTP API (port 8082) the bot uses to add/remove users.

Two inbounds are always present:
  - VLESS+WS on port 8080
  - VMess +WS on port 8081

Whenever a client is added/removed, the config file is rewritten and
Xray is restarted (sub-second downtime for everyone - acceptable for
a small/medium user base; if you outgrow this, Xray's gRPC API
supports live user updates without restart).
"""

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

API_SECRET = os.environ["API_SECRET"]
CLIENTS_FILE = "/app/clients.json"
CONFIG_FILE = "/app/config.json"

xray_process = None
lock = threading.Lock()


def load_clients():
    if not os.path.exists(CLIENTS_FILE):
        return []
    with open(CLIENTS_FILE) as f:
        return json.load(f)


def save_clients(clients):
    with open(CLIENTS_FILE, "w") as f:
        json.dump(clients, f)


def build_config(clients):
    vless_clients = [
        {"id": c["uuid"], "level": 0}
        for c in clients
        if c["protocol"] == "vless"
    ]
    vmess_clients = [
        {"id": c["uuid"], "level": 0, "alterId": 0}
        for c in clients
        if c["protocol"] == "vmess"
    ]

    return {
        "log": {"loglevel": "warning"},
        "inbounds": [
            {
                "port": 8080,
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {"clients": vless_clients, "decryption": "none"},
                "streamSettings": {
                    "network": "ws",
                    "wsSettings": {"path": "/vless"},
                },
            },
            {
                "port": 8081,
                "listen": "0.0.0.0",
                "protocol": "vmess",
                "settings": {"clients": vmess_clients},
                "streamSettings": {
                    "network": "ws",
                    "wsSettings": {"path": "/vmess"},
                },
            },
        ],
        "outbounds": [
            {"protocol": "freedom", "settings": {}},
            {"protocol": "blackhole", "tag": "blocked"},
        ],
        "routing": {
            "rules": [
                {"type": "field", "ip": ["geoip:private"], "outboundTag": "blocked"}
            ]
        },
    }


def restart_xray():
    global xray_process
    with lock:
        clients = load_clients()
        with open(CONFIG_FILE, "w") as f:
            json.dump(build_config(clients), f)

        if xray_process is not None:
            xray_process.terminate()
            try:
                xray_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                xray_process.kill()

        xray_process = subprocess.Popen(["xray", "run", "-c", CONFIG_FILE])
        print(f"Xray restarted with {len(clients)} client(s)")


class Handler(BaseHTTPRequestHandler):
    def _auth_ok(self):
        return self.headers.get("X-API-Key") == API_SECRET

    def _json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_POST(self):
        if not self._auth_ok():
            return self._json(401, {"error": "unauthorized"})
        if self.path != "/clients":
            return self._json(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
            protocol = body["protocol"]
            uuid = body["uuid"]
            remark = body.get("remark", "")
        except Exception:
            return self._json(400, {"error": "invalid body"})

        if protocol not in ("vless", "vmess"):
            return self._json(400, {"error": "protocol must be vless or vmess"})

        clients = load_clients()
        clients.append({"protocol": protocol, "uuid": uuid, "remark": remark})
        save_clients(clients)
        restart_xray()

        return self._json(200, {"status": "created"})

    def do_DELETE(self):
        if not self._auth_ok():
            return self._json(401, {"error": "unauthorized"})
        parts = self.path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "clients":
            return self._json(404, {"error": "not found"})

        protocol, uuid = parts[1], parts[2]
        clients = load_clients()
        clients = [
            c for c in clients if not (c["protocol"] == protocol and c["uuid"] == uuid)
        ]
        save_clients(clients)
        restart_xray()

        return self._json(200, {"status": "deleted"})

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    restart_xray()  # initial launch, even with zero clients
    server = HTTPServer(("0.0.0.0", 8082), Handler)
    print("Management API listening on :8082")
    server.serve_forever()
