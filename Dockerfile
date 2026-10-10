# One image with the API and the web portal behind a single port, for demos and small deployments.
# The web server listens on $PORT and forwards /api/* to the API on 127.0.0.1:4000.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.28.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
ENV NEXT_PUBLIC_API_URL=/api/v1 \
    API_PROXY_TARGET=http://127.0.0.1:4000 \
    NEXT_TELEMETRY_DISABLED=1 \
    LOW_MEMORY_BUILD=1
RUN pnpm --filter api prisma:generate && pnpm --filter api build && pnpm --filter web build

ENV NODE_ENV=production \
    PORT=3000 \
    JWT_EXPIRES_IN=12h \
    TRUST_PROXY=1 \
    UPLOAD_DIR=/app/apps/api/uploads
EXPOSE 3000
CMD ["sh", "deploy/start.sh"]
