# Railway deploy — CRM (OperaOS) back.
# Monorepo: the back imports from shared/ (repo root) and, for exports, reads
# front/ as a sibling of the process CWD. So we copy the WHOLE repo and run the
# server from back/ (CWD = /app/back) to keep those relative paths valid.
FROM node:22-slim

# openssl is required by Prisma engines on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

WORKDIR /app/back
# prisma.config.ts (Prisma 7) eagerly resolves DATABASE_URL when the Prisma CLI
# loads. `generate` never connects to the DB, so a build-only placeholder is
# enough; Render injects the real DATABASE_URL at runtime (it is NOT persisted here).
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npm ci && \
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx prisma generate

# Railway injects PORT; env.port reads process.env.PORT (fallback 4001).
CMD ["npm", "start"]
