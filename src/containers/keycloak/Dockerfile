FROM jboss/keycloak:latest
COPY ./realm-conf /opt/jboss/keycloak/realm-conf/
COPY ./resources/theme /opt/jboss/keycloak/themes/customlogin/

ENV PROXY_ADDRESS_FORWARDING ${PROXY_ADDRESS_FORWARDING}
#ENV KEYCLOAK_FRONTEND_URL ${KEYCLOAK_FRONTEND_URL}
ENV KEYCLOAK_LOGLEVEL ${KEYCLOAK_LOGLEVEL}
ENV KEYCLOAK_USER ${KEYCLOAK_USER}
ENV KEYCLOAK_PASSWORD ${KEYCLOAK_PASSWORD}

CMD ["-b 0.0.0.0", "-Dkeycloak.migration.action=import", "-Dkeycloak.migration.provider=dir", "-Dkeycloak.migration.dir=/opt/jboss/keycloak/realm-conf", "-Dkeycloak.migration.strategy=OVERWRITE_EXISTING"]
