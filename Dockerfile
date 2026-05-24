FROM node:22-alpine

RUN apk upgrade --no-cache

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source and pre-built frontend
COPY server/ ./server/
COPY web/dist/ ./web/dist/

EXPOSE 4000

ENV PORT=4000

CMD ["node", "--experimental-sqlite", "server/src/index.js"]
