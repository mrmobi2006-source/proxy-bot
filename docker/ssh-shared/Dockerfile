FROM alpine:3.20

RUN apk add --no-cache openssh bash python3 \
    && ssh-keygen -A

COPY entrypoint.sh /entrypoint.sh
COPY manage.py /manage.py
RUN chmod +x /entrypoint.sh

EXPOSE 22 8081
ENTRYPOINT ["/entrypoint.sh"]
