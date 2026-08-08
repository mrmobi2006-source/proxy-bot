#!/usr/bin/env python3

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

API_SECRET = os.environ["API_SECRET"]
PROTOCOL = os.environ.get("XRAY_PROTOCOL", "vless").lower()

CLIENTS_FILE = "/app/clients.json"
CONFIG_FILE = "/app/config.json"

assert PROTOCOL in ("vless", "vmess")

xray_proc = None
lock = threading.Lock()


def load_clients():
    if not os.path.exists(CLIENTS_FILE):
        return []

    try:
        with open(CLIENTS_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def save_clients(clients):
    with open(CLIENTS_FILE, "w") as f:
        json.dump(clients, f)


def build_config(clients):
    mine = [
        c for c in clients
        if c.get("protocol") == PROTOCOL
    ]

    if PROTOCOL == "vless":
        xc = [
            {
                "id": c["uuid"],
                "level": 0
            }
            for c in mine
        ]

        inbound = {
            "port": 8080,
            "listen": "0.0.0.0",
            "protocol": "vless",
            "settings": {
                "clients": xc,
                "decryption": "none"
            },
            "streamSettings": {
                "network": "ws",
                "security": "none",
                "wsSettings": {
                    "path": "/vless"
                }
            }
        }

    else:
        xc = [
            {
                "id": c["uuid"],
                "level": 0,
                "alterId": 0
            }
            for c in mine
        ]

        inbound = {
            "port": 8080,
            "listen": "0.0.0.0",
            "protocol": "vmess",
            "settings": {
                "clients": xc
            },
            "streamSettings": {
                "network": "ws",
                "security": "none",
                "wsSettings": {
                    "path": "/vmess"
                }
            }
        }

    return {
        "log": {
            "loglevel": "warning"
        },
        "inbounds": [
            inbound
        ],
        "outbounds": [
            {
                "protocol": "freedom",
                "settings": {}
            },
            {
                "protocol": "blackhole",
                "tag": "blocked"
            }
        ],
        "routing": {
            "rules": [
                {
                    "type": "field",
                    "ip": ["geoip:private"],
                    "outboundTag": "blocked"
                }
            ]
        }
    }


def restart_xray():
    global xray_proc

    with lock:
        clients = load_clients()

        with open(CONFIG_FILE, "w") as f:
            json.dump(build_config(clients), f)

        if xray_proc:
            xray_proc.terminate()

            try:
                xray_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                xray_proc.kill()

        xray_proc = subprocess.Popen(
            ["xray", "run", "-c", CONFIG_FILE]
        )

        print(
            f"Xray [{PROTOCOL.upper()}] restarted — "
            f"{len(clients)} client(s)",
            flush=True
        )


class Handler(BaseHTTPRequestHandler):

    def auth(self):
        return self.headers.get("X-API-Key") == API_SECRET

    def response(self, status, data):
        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json"
        )
        self.end_headers()
        self.wfile.write(
            json.dumps(data).encode()
        )

    def body(self):
        length = int(
            self.headers.get("Content-Length", 0)
        )

        if not length:
            return {}

        return json.loads(
            self.rfile.read(length)
        )

    def do_POST(self):
        if not self.auth():
            return self.response(
                401,
                {"error": "unauthorized"}
            )

        if self.path != "/clients":
            return self.response(
                404,
                {"error": "not found"}
            )

        try:
            data = self.body()

            protocol = data["protocol"]
            uuid = data["uuid"]
            remark = data.get("remark", "")

        except Exception:
            return self.response(
                400,
                {"error": "invalid body"}
            )

        if protocol != PROTOCOL:
            return self.response(
                400,
                {
                    "error":
                    f"this server handles {PROTOCOL} only"
                }
            )

        clients = load_clients()

        clients.append({
            "protocol": protocol,
            "uuid": uuid,
            "remark": remark
        })

        save_clients(clients)
        restart_xray()

        return self.response(
            200,
            {"status": "created"}
        )

    def do_DELETE(self):
        if not self.auth():
            return self.response(
                401,
                {"error": "unauthorized"}
            )

        parts = self.path.strip("/").split("/")

        if len(parts) != 3 or parts[0] != "clients":
            return self.response(
                404,
                {"error": "not found"}
            )

        protocol = parts[1]
        uuid = parts[2]

        clients = [
            c for c in load_clients()
            if not (
                c.get("protocol") == protocol
                and c.get("uuid") == uuid
            )
        ]

        save_clients(clients)
        restart_xray()

        return self.response(
            200,
            {"status": "deleted"}
        )

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print(
        f"Protocol: {PROTOCOL.upper()}",
        flush=True
    )

    restart_xray()

    print(
        "Management API on :8082",
        flush=True
    )

    HTTPServer(
        ("0.0.0.0", 8082),
        Handler
    ).serve_forever()
