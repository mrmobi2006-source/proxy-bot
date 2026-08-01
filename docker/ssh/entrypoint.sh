#!/bin/bash
set -e

SSH_USER="${SSH_USERNAME:?SSH_USERNAME env var required}"
SSH_PASS="${SSH_PASSWORD:?SSH_PASSWORD env var required}"

# فرض DNS موثوق - بدونه قد يفشل السيرفر بحل أسماء المواقع
cat > /etc/resolv.conf <<EOF
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF

id -u "$SSH_USER" &>/dev/null || adduser -D -s /bin/bash "$SSH_USER"
echo "${SSH_USER}:${SSH_PASS}" | chpasswd

cat >> /etc/ssh/sshd_config <<EOF
PermitRootLogin no
AllowUsers ${SSH_USER}
PasswordAuthentication yes
AllowTcpForwarding yes
PermitTunnel yes
GatewayPorts no
UseDNS no
ClientAliveInterval 60
ClientAliveCountMax 3
EOF

echo "Starting sshd for user ${SSH_USER}"
exec /usr/sbin/sshd -D -e
