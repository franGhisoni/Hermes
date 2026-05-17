FROM searxng/searxng:latest

COPY settings.yml /etc/searxng/settings.yml

ENV SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml \
    SEARXNG_BIND_ADDRESS=0.0.0.0 \
    SEARXNG_PORT=8080

EXPOSE 8080
