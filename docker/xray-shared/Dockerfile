FROM teddysun/xray:latest

RUN apk add --no-cache python3 || (apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*)

WORKDIR /app
COPY manage.py /app/manage.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080 8081 8082
ENTRYPOINT ["/entrypoint.sh"]
