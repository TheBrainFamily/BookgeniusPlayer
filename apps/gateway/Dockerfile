FROM openresty/openresty:alpine
RUN apk add --no-cache perl curl ca-certificates \
  && /usr/local/openresty/bin/opm get openresty/lua-resty-redis
