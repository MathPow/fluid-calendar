#!/bin/bash
# Called by cron to sync the boards and lists mapped in Settings ▸ Task Sync
# (Trello, GitHub…) with the tasks, both ways.
# Add to crontab with: crontab -e
#   */15 * * * * /home/uguiso/repos/fluid-calendar/scripts/task-sync-cron.sh
#
# Talks to the production container on this machine and reads the cron secret
# from it, so the secret is not copied anywhere else.

APP_URL="${TASK_SYNC_APP_URL:-http://127.0.0.1:3006}"
CONTAINER="$(docker ps --format '{{.Names}}' | grep '^y12cwx669z6c9bw5125h3xvl' | head -1)"
[ -n "$CONTAINER" ] || exit 0

SECRET="$(docker exec "$CONTAINER" printenv CRON_SECRET)"
[ -n "$SECRET" ] || exit 0

curl -s -m 300 -X POST "${APP_URL}/api/task-sync/cron" \
  -H "x-cron-secret: ${SECRET}" \
  -o /dev/null
