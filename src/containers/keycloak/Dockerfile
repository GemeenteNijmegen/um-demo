FROM --platform=arm64 keycloak/keycloak:latest

COPY ./realm-conf /opt/jboss/keycloak/realm-conf/
COPY ./resources/theme /opt/jboss/keycloak/themes/customlogin/

ENV KC_HEALTH_ENABLED=true
ENV KEYCLOAK_ADMIN_PASSWORD=nijmegen
ENV KEYCLOAK_ADMIN=nijmegen

# ENV KC_PROXY edge
# ENV KC_HEALTH_ENABLED true
# ENV KC_HOSTNAME_STRICT true
# ENV KC_HOSTNAME_URL http://localhost:8080/auth/
# ENV KC_HTTP_ENABLED true
# ENV KC_HTTP_RELATIVE_PATH /auth

CMD ["start-dev", "-Dkeycloak.migration.action=import", "-Dkeycloak.migration.provider=dir", "-Dkeycloak.migration.dir=/opt/jboss/keycloak/realm-conf", "-Dkeycloak.migration.strategy=OVERWRITE_EXISTING"]
