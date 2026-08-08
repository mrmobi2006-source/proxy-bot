#!/usr/bin/env python3
"""
Single-protocol Xray manager.
نشرها مرتين في Railway:
  مرة بـ XRAY_PROTOCOL=vless  ← TCP Proxy → :8080
  مرة بـ XRAY_PROTOCOL=vmess  ← TCP Proxy → :8080

manage.py API: :8082 (private network فقط)
Stats gRPC:    :8083 (internal)
"""

import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

API_SECRET = os.environ["API_SECRET"]
PROTOCOL = os.environ.get("XRAY_PROTOCOL", "vless").lower()
CLIENTS_FILE = "/app/clients.json"
CONFIG_FILE = "/app/config.json"
XRAY_STATS = "127.0.0.1:7300"

assert PROTOCOL in ("vless", "vmess"), "XRAY_PROTOCOL must be vless or vmess"

xray_proc = None
lock = threading.Lock()


def load_clients():
    if not os.path.exists(CLIENTS_FILE):
        return []

    with open(CLIENTS_FILE) as f:
        return json.load(f)


def save_clients(c):
    with open(CLIENTS_FILE, "w") as f:
        json.dump(c, f)


def query_stat(name):
    try:
        r = subprocess.run(
            ["xray", "api", "stats", f"-s={XRAY_STATS}", f"-n={name}"],
            capture_output=True,
            text=True,
            timeout=4
        )

        if r.returncode != 0:
            return 0

        return int(
            json.loads(r.stdout).get("stat", {}).get("value") or 0
        )

    except:
        return 0


def build_config(clients):
    mine = [c for c in clients if c["protocol"] == PROTOCOL]

    if PROTOCOL == "vless":
        xc = [
            {
                "id": c["uuid"],
                "email": c.get(
                    "email",
                    f"{c['uuid'][:8]}@xtt1x"
                ),
                "level": 0
            }
            for c in mine
        ]

        inb = {
            "port": 8080,
            "listen": "0.0.0.0",
            "protocol": "vless",
            "settings": {
                "clients": xc,
                "decryption": "none"
            },
            "streamSettings": {
                "network": "ws",
                "wsSettings": {
                    "path": "/vless"
                }
            }
        }

    else:
        xc = [
            {
                "id": c["uuid"],
                "email": c.get(
                    "email",
                    f"{c['uuid'][:8]}@xtt1x"
                ),
                "level": 0,
                "alterId": 0
            }
            for c in mine
        ]

        inb = {
            "port": 8080,
            "listen": "0.0.0.0",
            "protocol": "vmess",
            "settings": {
                "clients": xc
            },
            "streamSettings": {
                "network": "ws",
                "wsSettings": {
                    "path": "/vmess"
                }
            }
        }

    return {
        "stats": {},
        "api": {
            "tag": "api",
            "services": ["StatsService"]
        },
        "policy": {
            "levels": {
                "0": {
                    "statsUserUplink": True,
                    "statsUserDownlink": True
                }
            },
            "system": {
                "statsInboundUplink": True,
                "statsInboundDownlink": True
            }
        },
        "log": {
            "loglevel": "warning"
        },
        "inbounds": [
            {
                "listen": "127.0.0.1",
                "port": 8083,
                "protocol": "dokodemo-door",
                "settings": {
                    "address": "127.0.0.1"
                },
                "tag": "api"
            },
            inb
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
                    "inboundTag": ["api"],
                    "outboundTag": "api"
                },
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


class H(BaseHTTPRequestHandler):

    def _auth(self):
        return self.headers.get("X-API-Key") == API_SECRET

    def _json(self, st, p):
        self.send_response(st)
        self.send_header(
            "Content-Type",
            "application/json"
        )
        self.end_headers()
        self.wfile.write(json.dumps(p).encode())

    def _body(self):
        n = int(
            self.headers.get(
                "Content-Length",
                0
            )
        )

        return (
            json.loads(self.rfile.read(n))
            if n
            else {}
        )

    def do_GET(self):
        if not self._auth():
            return self._json(
                401,
                {"error": "unauthorized"}
            )

        if self.path.startswith("/stats/"):
            e = self.path[7:]

            return self._json(
                200,
                {
                    "up": query_stat(
                        f"user>>>{e}>>>traffic>>>uplink"
                    ),
                    "down": query_stat(
                        f"user>>>{e}>>>traffic>>>downlink"
                    )
                }
            )

        self._json(
            404,
            {"error": "not found"}
        )

    def do_POST(self):
        if not self._auth():
            return self._json(
                401,
                {"error": "unauthorized"}
            )

        if self.path != "/clients":
            return self._json(
                404,
                {"error": "not found"}
            )

        try:
            b = self._body()

            protocol = b["protocol"]
            uuid = b["uuid"]
            remark = b.get("remark", "")
            email = b.get(
                "email",
                f"{uuid[:8]}@xtt1x"
            )

        except:
            return self._json(
                400,
                {"error": "invalid body"}
            )

        if protocol != PROTOCOL:
            return self._json(
                400,
                {
                    "error":
                    f"this server handles {PROTOCOL} only"
                }
            )

        clients = load_clients()

        clients.append(
            {
                "protocol": protocol,
                "uuid": uuid,
                "remark": remark,
                "email": email
            }
        )

        save_clients(clients)
        restart_xray()

        self._json(
            200,
            {"status": "created"}
        )

    def do_DELETE(self):
        if not self._auth():
            return self._json(
                401,
                {"error": "unauthorized"}
            )

        parts = self.path.strip("/").split("/")

        if (
            len(parts) != 3
            or parts[0] != "clients"
        ):
            return self._json(
                404,
                {"error": "not found"}
            )

        protocol, uuid = parts[1], parts[2]

        clients = [
            c
            for c in load_clients()
            if not (
                c["protocol"] == protocol
                and c["uuid"] == uuid
            )
        ]

        save_clients(clients)
        restart_xray()

        self._json(
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
        H
    ).serve_forever()
