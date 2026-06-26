#!/usr/bin/env bash
#
# meetily-sync.sh — watch Meetily's output folder and sync finished recordings
# to DreamDash (Notes ▸ Recordings). For each audio file it finds, it POSTs the
# audio plus a matching transcript/summary (if present) to /api/recordings.
#
# Runs on the MAC (where Meetily lives), not the Linux box. Reaches DreamDash
# over Tailscale. Run under launchd or pm2 so it restarts on reboot:
#   pm2 start scripts/meetily-sync.sh --name meetily-sync --interpreter bash
#
# Config via env (export before running, or edit the defaults):
#   DREAMDASH_URL   DreamDash base URL over Tailscale (default http://100.88.98.44:3006)
#   RECORDINGS_API_KEY   must match the server's key (required)
#   MEETILY_DIR     folder Meetily writes recordings to (default ~/Meetily/recordings)
#   POLL_SECONDS    how often to scan when inotify/fswatch isn't available (default 30)
#
# Pairing convention: for an audio file  meeting.m4a  it will also send, if they
# exist alongside it:  meeting.txt (transcript)  and  meeting.summary.txt (summary).
# After a successful upload the audio is moved to a .synced/ subfolder so it isn't
# sent twice.

set -euo pipefail

DREAMDASH_URL="${DREAMDASH_URL:-http://100.88.98.44:3006}"
MEETILY_DIR="${MEETILY_DIR:-$HOME/Meetily/recordings}"
POLL_SECONDS="${POLL_SECONDS:-30}"
SYNCED_DIR="$MEETILY_DIR/.synced"

if [ -z "${RECORDINGS_API_KEY:-}" ]; then
  echo "RECORDINGS_API_KEY is not set — refusing to run." >&2
  exit 1
fi

mkdir -p "$SYNCED_DIR"

upload_one() {
  audio="$1"
  [ -f "$audio" ] || return 0
  base="${audio%.*}"               # strip extension
  name="$(basename "$base")"
  transcript="${base}.txt"
  summary="${base}.summary.txt"

  echo "→ uploading $name"

  args=(-sf -X POST "$DREAMDASH_URL/api/recordings"
        -H "X-Api-Key: $RECORDINGS_API_KEY"
        -F "file=@${audio}"
        -F "title=${name}"
        -F "source=meetily")

  [ -f "$transcript" ] && args+=(-F "transcript=<${transcript}")
  [ -f "$summary" ]    && args+=(-F "summary=<${summary}")

  if curl "${args[@]}" >/dev/null; then
    mv "$audio" "$SYNCED_DIR/"
    echo "  ✓ stored, moved to .synced/"
  else
    echo "  ✗ upload failed, will retry next pass" >&2
  fi
}

scan() {
  # Pick up common audio extensions Meetily may emit.
  find "$MEETILY_DIR" -maxdepth 1 -type f \
    \( -iname '*.m4a' -o -iname '*.mp3' -o -iname '*.wav' -o -iname '*.webm' \) \
    -print0 2>/dev/null |
  while IFS= read -r -d '' f; do
    upload_one "$f"
  done
}

echo "Watching $MEETILY_DIR → $DREAMDASH_URL (every ${POLL_SECONDS}s)"

# Prefer event-driven watching when fswatch (brew install fswatch) is present;
# otherwise fall back to polling.
if command -v fswatch >/dev/null 2>&1; then
  scan   # catch anything already waiting
  fswatch -0 --event Created --event Updated "$MEETILY_DIR" |
  while IFS= read -r -d '' _; do
    scan
  done
else
  while true; do
    scan
    sleep "$POLL_SECONDS"
  done
fi
