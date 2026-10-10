#!/bin/sh
# Container entrypoint: migrate, seed the demo school (skipped when it exists), then run
# the API on 127.0.0.1:4000 and the web portal on $PORT. Exits when either process stops.
set -e
cd /app/apps/api
: "${JWT_SECRET:?JWT_SECRET must be set}"
npx prisma migrate deploy
if [ "${SEED_DEMO:-true}" = "true" ]; then pnpm seed; fi

# Keep both processes inside small instances (Render free tier has 512 MB).
HEAP="--max-old-space-size=${RUNTIME_HEAP_MB:-200}"
PORT=4000 node $HEAP dist/main.js &
API_PID=$!
cd /app/apps/web
NODE_OPTIONS="$HEAP" npx next start -p "${PORT:-3000}" -H 0.0.0.0 &
WEB_PID=$!
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do sleep 5; done
exit 1
