#!/bin/bash
set -e

: "${API_SECRET:?API_SECRET env var required}"

# Force reliable public DNS resolvers - without this, sshd can accept
# a tunnel connection fine but fail to resolve hostnames for every
# site the client tries to reach through it.
cat > /etc/resolv.conf <<EOF
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF

cat >> /etc/ssh/sshd_config <<EOF
PermitRootLogin no
PasswordAuthentication yes
AllowTcpForwarding yes
PermitTunnel yes
GatewayPorts no
UseDNS no
ClientAliveInterval 60
ClientAliveCountMax 3
EOF

echo "Starting management API..."
python3 /manage.py &

echo "Starting sshd..."
exec /usr/sbin/sshd -D -e
