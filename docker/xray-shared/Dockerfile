FROM teddysun/xray:latest

RUN apk add --no-cache python3

WORKDIR /app
COPY manage.py    /app/manage.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 8080 = VLESS (TCP Proxy → هنا)
# 8081 = VMess  (TCP Proxy → هنا)
# 8082 = manage.py API (private network فقط)
EXPOSE 8080 8081 8082
ENTRYPOINT ["/entrypoint.sh"]
