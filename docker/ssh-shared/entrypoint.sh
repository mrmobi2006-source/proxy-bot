#!/bin/bash
set -e

: "${API_SECRET:?API_SECRET env var required}"

cat > /etc/resolv.conf <<EOF
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF

cat > /etc/motd <<'EOF'

  ================================
        Powered by @xtt1x
     Channel: https://t.me/xtt10x
       (c) All rights reserved
  ================================

EOF

sed -i \
  -e '/^AllowTcpForwarding/d' \
  -e '/^PermitTunnel/d' \
  -e '/^GatewayPorts/d' \
  -e '/^PasswordAuthentication/d' \
  -e '/^PermitRootLogin/d' \
  -e '/^UseDNS/d' \
  -e '/^ClientAliveInterval/d' \
  -e '/^ClientAliveCountMax/d' \
  -e '/^PrintMotd/d' \
  /etc/ssh/sshd_config

cat >> /etc/ssh/sshd_config <<EOF
PermitRootLogin no
PasswordAuthentication yes
AllowTcpForwarding yes
PermitTunnel yes
GatewayPorts no
UseDNS no
ClientAliveInterval 60
ClientAliveCountMax 3
PrintMotd yes
EOF

echo "Starting management API..."
python3 /manage.py &

echo "Starting sshd..."
exec /usr/sbin/sshd -D -e
