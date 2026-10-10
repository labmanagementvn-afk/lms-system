#!/bin/sh
# Container entrypoint: migrate, seed the demo school (skipped when it exists), then run
# the API on 127.0.0.1:4000 and the web portal on $PORT. Exits when either process stops.
# Everything runs through plain `node` (no npx/pnpm wrappers, seed without type checking)
# so the container fits a 512 MB instance such as Render's free plan.
set -e
cd /app/apps/api
: "${JWT_SECRET:?JWT_SECRET must be set}"
node node_modules/prisma/build/index.js migrate deploy
if [ "${SEED_DEMO:-true}" = "true" ]; then node -r ts-node/register/transpile-only prisma/seed.ts; fi

HEAP="--max-old-space-size=${RUNTIME_HEAP_MB:-200}"
PORT=4000 node $HEAP dist/main.js &
API_PID=$!
cd /app/apps/web
node $HEAP node_modules/next/dist/bin/next start -p "${PORT:-3000}" -H 0.0.0.0 &
WEB_PID=$!
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do sleep 5; done
exit 1
