#!/usr/bin/env node
// DreamDash desktop agent — runs commands sent from DreamDash in this
// machine's GNOME session. Outbound only: it long-polls DreamDash for work
// (POST /api/agent/claim) and reports back; nothing listens on this machine.
//
//   DREAMDASH_URL   default https://uguiso-thinkcentre-m83.taila15d52.ts.net:8444
//   token           ~/.config/dreamdash-agent/token (from Machines ▸ Commandes ▸ Connecter)
//
// Every argument is re-checked here. Only `shell` runs arbitrary code, and
// only after a Yes in a zenity dialog on this desktop.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const BASE = (process.env.DREAMDASH_URL || "https://uguiso-thinkcentre-m83.taila15d52.ts.net:8444").replace(/\/$/, "");
const TOKEN = readFileSync(join(HOME, ".config/dreamdash-agent/token"), "utf8").trim();
const CONFIRM_SECONDS = 120;
const SHELL_TIMEOUT_MS = 120_000;
const AGENT_RUN_TIMEOUT_MS = 15 * 60_000;
const TAIL = 20_000;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function api(method, path, body) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
  });
}

/** Run without a shell; resolves { code, out }. */
function run(cmd, args, { input, timeoutMs = 20_000, cwd, detached = false } = {}) {
  return new Promise((done) => {
    let out = "";
    const p = spawn(cmd, args, { cwd, detached, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
    const keep = (c) => (out = (out + c.toString()).slice(-TAIL));
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    if (input) p.stdin.end(input);
    const t = setTimeout(() => {
      try {
        detached ? process.kill(-p.pid, "SIGKILL") : p.kill("SIGKILL");
      } catch {}
      out += "\n[arrêté : délai dépassé]";
    }, timeoutMs);
    p.on("close", (code) => {
      clearTimeout(t);
      done({ code, out });
    });
    p.on("error", (e) => {
      clearTimeout(t);
      done({ code: -1, out: e.message });
    });
  });
}

/** Start a GUI program and let it live on its own. */
function launch(cmd, args) {
  const p = spawn(cmd, args, { detached: true, stdio: "ignore" });
  p.unref();
  return new Promise((done) => {
    p.on("error", (e) => done({ code: -1, out: e.message }));
    setTimeout(() => done({ code: 0, out: "" }), 400);
  });
}

const isAbs = (p) => typeof p === "string" && p.startsWith("/") && !p.includes("\0") && p.length < 500;

async function execute(action, a) {
  switch (action) {
    case "open_url":
      if (!/^https?:\/\//i.test(a.url ?? "")) throw new Error("Adresse refusée");
      return launch("xdg-open", [a.url]);
    case "open_path":
      if (!isAbs(a.path) || !existsSync(a.path)) throw new Error(`Introuvable : ${a.path}`);
      return launch("xdg-open", [a.path]);
    case "open_code":
      if (!isAbs(a.path) || !existsSync(a.path)) throw new Error(`Introuvable : ${a.path}`);
      return launch("code", ["--new-window", a.path]);
    case "open_app":
      if (!/^[A-Za-z0-9._-]{1,120}$/.test(a.app ?? "")) throw new Error("Application refusée");
      return launch("gtk-launch", [a.app]);
    case "notify":
      return run("notify-send", ["--app-name=DreamDash", String(a.title ?? "DreamDash"), String(a.body ?? "")]);
    case "clipboard":
      return run("wl-copy", [], { input: String(a.text ?? "") });
    case "lock":
      return run("loginctl", ["lock-sessions"]);
    case "shell": {
      const command = String(a.command ?? "").trim();
      if (!command) throw new Error("Commande vide");
      const cwd = isAbs(a.cwd) && existsSync(a.cwd) ? a.cwd : HOME;
      const ask = await run(
        "zenity",
        [
          "--question",
          "--no-markup",
          "--title=DreamDash",
          `--text=DreamDash veut exécuter sur ${hostname()} :\n\n${command}\n\ndans ${cwd}`,
          "--ok-label=Exécuter",
          "--cancel-label=Refuser",
          `--timeout=${CONFIRM_SECONDS}`,
          "--width=520",
        ],
        { timeoutMs: (CONFIRM_SECONDS + 5) * 1000 }
      );
      if (ask.code !== 0) return { denied: true };
      return run("bash", ["-lc", command], { cwd, timeoutMs: SHELL_TIMEOUT_MS, detached: true });
    }
    case "agent_run": {
      // Prompt shortcuts (claude -p / codex exec). The user has approved the
      // shortcut once at creation time, so we skip zenity — but we surface a
      // desktop notification and never expose the prompt in argv.
      const command = String(a.command ?? "").trim();
      if (!command) throw new Error("Commande vide");
      const cwd = isAbs(a.cwd) && existsSync(a.cwd) ? a.cwd : HOME;
      const input = typeof a.input === "string" ? a.input : "";
      run("notify-send", [
        "--app-name=DreamDash",
        "Raccourci prompt",
        `${command} sur ${hostname()}`,
      ]).catch(() => {});
      return run("bash", ["-lc", command], {
        cwd,
        input,
        timeoutMs: AGENT_RUN_TIMEOUT_MS,
        detached: true,
      });
    }
    default:
      throw new Error(`Action inconnue : ${action}`);
  }
}

async function report(id, body) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await api("PATCH", `/api/agent/commands/${id}`, body);
      if (r.ok || r.status === 404) return;
    } catch {}
    await sleep(2000 * (i + 1));
  }
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));

log(`agent up on ${hostname()} → ${BASE}`);
let lastError = "";
while (!stopping) {
  try {
    const res = await api("POST", "/api/agent/claim");
    if (res.status === 401) {
      log("token refusé — reconnecte l'agent depuis DreamDash (Machines ▸ Commandes)");
      await sleep(60_000);
      continue;
    }
    if (res.status === 200) {
      lastError = "";
      const { id, action, args } = await res.json();
      log(`→ ${action}`);
      try {
        const r = await execute(action, args ?? {});
        if (r.denied) await report(id, { status: "denied", error: "Refusé sur l'ordi (ou sans réponse)." });
        else
          await report(id, {
            status: r.code === 0 ? "done" : "failed",
            output: r.out || undefined,
            error: r.code === 0 ? undefined : `Code de sortie ${r.code}`,
          });
      } catch (e) {
        await report(id, { status: "failed", error: e.message });
      }
      continue;
    }
    if (res.status !== 204) throw new Error(`claim → ${res.status}`);
    lastError = "";
  } catch (e) {
    if (e.message !== lastError) log(`claim failed: ${e.message}`);
    lastError = e.message;
    await sleep(10_000);
  }
}
