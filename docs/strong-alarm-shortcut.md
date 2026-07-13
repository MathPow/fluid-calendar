# Strong alarm → real iPhone alarm (iOS Shortcut)

A normal push reminder can't ring loudly through silent mode or a locked screen.
The **strong alarm** feature works around that by having an iOS Shortcut poll
DreamDash and create a **real Clock-app alarm** for events you flagged — those
ring loud even when the phone is locked or silent.

## How it works

1. In the event editor, tick **🔔 M'alerter fortement** and set the lead time
   (default 30 min before the start).
2. A time-based **Personal Automation** on the iPhone runs a Shortcut every hour
   (or a few times a day).
3. The Shortcut calls `GET /api/shortcuts/alarms`. The server returns any flagged
   event whose alarm fires **within the next 24 hours** and hasn't been handed
   out yet, then marks it "armed" so it's served exactly once.
4. For each returned event the Shortcut runs **Create Alarm** at
   `start − alarmMinutes`. iOS handles the actual ringing.

If you later change the event's start time or toggle the flag, the server
re-arms it so the Shortcut recreates the alarm on its next run.

### Why "within 24 hours"

iOS alarms created by Shortcuts are **time-of-day only** (they ring at the next
occurrence of HH:MM), not date-bound. The next occurrence of any time-of-day is
always ≤ 24h away, so the server only hands out an alarm once its fire time is
inside that window — which guarantees it rings at the right moment. Run the
automation at least a few times a day so nothing is missed.

## Server setup

Auth reuses the recordings ingest key — no new env var. In `.env`:

```
RECORDINGS_API_KEY=...            # openssl rand -hex 32
RECORDINGS_USER_EMAIL=you@...     # omit on a single-user box
```

Test the endpoint (without arming anything) with `?peek=1`:

```bash
curl -s -H "X-Api-Key: $RECORDINGS_API_KEY" \
  "$NEXTAUTH_URL/api/shortcuts/alarms?peek=1" | jq
```

Response shape:

```json
{
  "alarms": [
    {
      "id": "…",
      "title": "Dentist",
      "start": "2026-07-13T14:00:00.000Z",
      "alarmTime": "2026-07-13T13:30:00.000Z",
      "alarmMinutes": 30
    }
  ]
}
```

## Building the iOS Shortcut

Create a Shortcut named e.g. **"Arm DreamDash alarms"**:

1. **Get Contents of URL**
   - URL: `https://<your-dreamdash-host>/api/shortcuts/alarms`
   - Method: `GET`
   - Headers: add `X-Api-Key` = your `RECORDINGS_API_KEY`
2. **Get Dictionary Value** → `alarms` from the previous step (this is the list).
3. **Repeat with Each** (over the `alarms` list). Inside the loop:
   - **Get Dictionary Value** → `alarmTime` from *Repeat Item*.
   - **Get Dictionary Value** → `title` from *Repeat Item*.
   - **Date** — convert the `alarmTime` text to a date (the value is ISO-8601
     UTC; iOS parses and displays it in the device's local time zone).
   - **Create Alarm** — Time = that date, Label = the `title`. (Optional: leave
     "Ask Before Running" off so it's silent.)

Then create a **Personal Automation** (Shortcuts → Automation → Create Personal
Automation → *Time of Day*), set it to run at the times you want (e.g. every hour
between 7am and 11pm), action = *Run Shortcut* → "Arm DreamDash alarms", and turn
**Ask Before Running off** so it runs unattended.

### Notes / caveats

- The PWA doesn't need to be open — the Shortcut talks straight to the server.
- Cleanup: iOS one-time alarms disable themselves after ringing; recurring
  Clock alarms don't, so if you reuse the same label you may want a periodic
  "delete old alarms" step. The server never creates duplicates (each event is
  served once), but iOS keeps whatever alarms it created.
- Time zone: the device must be in the same time zone the event times represent
  (normal case). The server sends UTC ISO strings; iOS localizes them.
