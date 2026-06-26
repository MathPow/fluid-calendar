# Recordings ingest (Notes ▸ Recordings)

DreamDash can receive audio recordings from external capture clients and show
them under **Notes ▸ Recordings** with an inline player plus any transcript /
summary the client sends. DreamDash itself doesn't record — Meetily (on the Mac)
and the Apple Watch / iPhone are the recorders; they POST into DreamDash.

## Endpoint

```
POST /api/recordings
Header: X-Api-Key: <RECORDINGS_API_KEY>
Body:   multipart/form-data
  file        (required)  the audio file
  title       (optional)  defaults to the filename
  source      (optional)  "meetily" | "watch" | "upload"
  transcript  (optional)  full transcript text
  summary     (optional)  short summary
  recordedAt  (optional)  ISO 8601 timestamp of capture
  durationSec (optional)  integer seconds
```

Returns `201 { id, title, status: "stored" }`.

### Config (server `.env`)

```
RECORDINGS_API_KEY=<openssl rand -hex 32>   # required, enables ingest
RECORDINGS_USER_EMAIL=                      # attribute uploads to this user; omit on single-user
RECORDINGS_DIR=/home/uguiso/DreamDash/recordings   # PERSISTENT path for the audio files
```

> ⚠️ On Coolify, mount `RECORDINGS_DIR` as a persistent volume — otherwise the
> audio files are wiped on every redeploy (the DB rows survive but point at
> missing files).

### Reaching DreamDash

Use the **Tailscale IP**, not the public Cloudflare-Access URL (Access would
block an unattended client). DreamDash listens on host port `3006`:

```
http://<tailscale-ip>:3006/api/recordings     # e.g. http://100.88.98.44:3006/api/recordings
```

Get the IP with `tailscale ip -4` on the Linux box.

### Smoke test (curl)

```bash
curl -X POST http://100.88.98.44:3006/api/recordings \
  -H "X-Api-Key: $RECORDINGS_API_KEY" \
  -F "file=@/path/to/test.m4a" \
  -F "title=Test recording" \
  -F "source=upload"
```

---

## iPhone / Apple Watch — Shortcut

The Watch records to **Voice Memos**, which sync to the iPhone; the Shortcut
uploads the latest one. Create a Shortcut named e.g. **"Send to DreamDash"**:

1. **Get Latest Voice Memos** → Limit `1` (or **Ask for Input ▸ Files**, type Audio, to pick manually).
2. **Get Details of Files** → `Name` (use as the title, optional).
3. **Get Contents of URL**
   - URL: `http://100.88.98.44:3006/api/recordings`
   - Method: `POST`
   - Headers: `X-Api-Key` = `<your key>`
   - Request Body: `Form`
     - `file` → (File) the audio from step 1
     - `source` → (Text) `watch`
     - `title` → (Text) the Name from step 2
4. **Show Result** (the `{ status: "stored" }` JSON) — optional confirmation.

Add the Shortcut to your Watch face / a complication to fire it right after a
memo. To run hands-free, drop steps 1–2 into an **Automation** (e.g. "When I
open Voice Memos" or on a schedule) so it uploads without prompting.

> Apple Watch memos are audio only — no transcript. Open the recording in
> DreamDash to play it; add `meetily` uploads (below) when you want transcripts.

---

## Meetily (Mac) — auto-sync

Meetily records meetings and produces a transcript + summary. `scripts/meetily-sync.sh`
watches Meetily's output folder and POSTs each finished recording (audio +
transcript + summary) to DreamDash over Tailscale. See that script's header for
the env vars; run it under launchd/`pm2` on the Mac for auto-restart.
