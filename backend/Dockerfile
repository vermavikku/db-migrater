FROM mysql:8.0 AS mysql-tools

FROM node:24-trixie-slim

ENV NODE_ENV=production
WORKDIR /app

# Debian's PostgreSQL 17 client and the libraries needed by the official MySQL 8 client binaries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 libncurses6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=mysql-tools /usr/bin/mysql /usr/local/bin/mysql
COPY --from=mysql-tools /usr/bin/mysqldump /usr/local/bin/mysqldump
RUN mysql --version && mysqldump --version && pg_dump --version && pg_restore --version

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src

USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
