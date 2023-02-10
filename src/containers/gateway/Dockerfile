FROM --platform=amd64 kong:2.6.0-alpine

USER root

ENV KONG_PLUGINS=oidc,cors,request-termination

COPY ./kong.compose.conf /etc/kong/kong.conf
COPY ./kong.compose.yml /usr/local/kong/declarative/kong.yml

RUN chown kong:root /etc/kong/kong.conf
RUN chown kong:root /usr/local/kong/declarative/kong.yml

# install kong-oidc plugin from https://github.com/nokia/kong-oidc/
RUN luarocks install kong-oidc

USER kong
