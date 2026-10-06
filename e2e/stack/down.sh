#!/usr/bin/env bash
set -uo pipefail
STATE_DIR="${STATE_DIR:-/tmp/docuflow-e2e-stack}"
for p in gotrue gateway; do
  [ -f "$STATE_DIR/$p.pid" ] && kill "$(cat "$STATE_DIR/$p.pid")" 2>/dev/null; rm -f "$STATE_DIR/$p.pid"
done
docker rm -f docuflow-storage docuflow-rest docuflow-mail >/dev/null 2>&1
echo "stack stopped"
