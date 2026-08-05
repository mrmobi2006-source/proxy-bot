FROM teddysun/xray:latest

RUN apk add --no-cache nginx python3

WORKDIR /app
COPY manage.py    /app/manage.py
COPY nginx.conf   /etc/nginx/http.d/xray.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080 8082
ENTRYPOINT ["/entrypoint.sh"]
