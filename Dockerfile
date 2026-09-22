FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV RUN_WORKER_IN_PROCESS=true
ENV DATABASE_URL="file:/app/data/prod.db"

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Persistent data directory for SQLite database and uploaded images
RUN mkdir -p /app/data /app/uploads/images

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/client/public ./src/client/public

EXPOSE 3001

VOLUME ["/app/data", "/app/uploads/images"]

CMD ["sh", "-c", "npx prisma db push && node dist/server/src/server/index.js"]
