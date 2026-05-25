FROM node:24-alpine AS builder

RUN apk upgrade --no-cache

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

FROM node:24-alpine AS runtime

RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx

WORKDIR /app

COPY --from=builder /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY web/dist/ ./web/dist/

EXPOSE 4000

ENV PORT=4000

CMD ["node", "server/dist/index.js"]
