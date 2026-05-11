#!/bin/bash
# Called every minute by cron to dispatch push reminders for upcoming events.
# Add to crontab with: crontab -e
#   * * * * * /home/uguiso/repos/fluid-calendar/scripts/push-reminders-cron.sh

set -a
source /home/uguiso/repos/fluid-calendar/.env
set +a

curl -s -X POST "${NEXTAUTH_URL}/api/push/reminders" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -o /dev/null
