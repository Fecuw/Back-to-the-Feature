FROM alpine:3.20

RUN apk add --no-cache \
    bash \
    busybox-extras \
    curl \
    iproute2 \
    jq \
    nano \
    postgresql-client \
    procps \
    redis \
  && addgroup -g 10001 btf \
  && adduser -D -u 10001 -G btf -s /bin/bash btf

COPY start-target.sh /usr/local/bin/start-target
COPY btfctl.sh /usr/local/bin/btfctl
COPY profile.sh /etc/profile.d/btf.sh
COPY www /opt/btf/www
COPY defaults /opt/btf/defaults

RUN chmod 0555 /usr/local/bin/start-target /usr/local/bin/btfctl \
  && for command in help status services ports logs inspect config; do ln -s /usr/local/bin/btfctl "/usr/local/bin/$command"; done \
  && chmod -R a-w /opt/btf /etc/profile.d/btf.sh

USER 10001:10001
WORKDIR /workspace
EXPOSE 8080
CMD ["/usr/local/bin/start-target"]
