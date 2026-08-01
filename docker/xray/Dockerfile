FROM teddysun/xray:latest

WORKDIR /etc/xray

COPY config.template.json /etc/xray/config.template.json
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Railway injects $PORT at runtime - we template it into the config
ENTRYPOINT ["/entrypoint.sh"]
