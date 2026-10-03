#!/bin/sh
set -eu
node scripts/docker-migrate.mjs
# Replace the shell so Docker sends shutdown signals directly to Next.js.
exec node server.js
