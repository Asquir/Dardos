# Imagen del servidor online de Diana Legends
FROM node:22-alpine
WORKDIR /srv
COPY shared ./shared
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY server/src ./server/src
ENV PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
WORKDIR /srv/server
CMD ["npx", "tsx", "src/index.ts"]
