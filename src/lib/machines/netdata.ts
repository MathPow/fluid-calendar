/**
 * Live machine status, read from each machine's Netdata agent.
 *
 * The browser can't ask the agents itself (they speak plain HTTP on the
 * tailnet, the app is served over HTTPS), so the server does it. Works with
 * Netdata v1 and v2, whose chart names differ.
 */

export interface MachineStats {
  online: boolean;
  checkedAt: string;
  error?: string;
  os: string | null;
  cores: number | null;
  /** Percent, 0–100. */
  cpu: number | null;
  ram: Usage | null;
  disk: Usage | null;
  /** Kilobits per second. */
  net: { rx: number; tx: number } | null;
  /** °C */
  temp: number | null;
  load: number | null;
  /** Seconds. */
  uptime: number | null;
  gpu: {
    util: number | null;
    vram: Usage | null;
    temp: number | null;
    watts: number | null;
  } | null;
  power: { watts: number; load: number | null } | null;
}

/** Sizes in GiB. */
export interface Usage {
  pct: number;
  used: number;
  total: number;
}

interface Discovery {
  at: number;
  os: string | null;
  cores: number | null;
  disk: string | null;
  temp: string | null;
  gpu: string | null; // chart prefix, e.g. "nvidia_smi.gpu_gpu-…"
  power: boolean;
  load: boolean;
  uptime: boolean;
  net: boolean;
}

const TIMEOUT_MS = 2500;
const DISCOVERY_TTL_MS = 30 * 60 * 1000;
const FRESH_MS = 2000; // several dashboards open: one read serves them all
const STALE_MS = 60 * 1000; // older than this, a reading is not shown anymore
const OFFLINE_RETRY_MS = 20 * 1000; // don't wait on a sleeping laptop each poll

const discoveries = new Map<string, Discovery>();
const latest = new Map<string, { at: number; stats: MachineStats }>();
const pending = new Map<string, Promise<MachineStats>>();

type Row = Record<string, number | null>;

/** Only the origin is kept, so the server never calls an arbitrary path. */
export function netdataOrigin(statsUrl: string): string | null {
  try {
    const u = new URL(statsUrl.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, timeout = TIMEOUT_MS): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function chart(origin: string, id: string): Promise<Row> {
  const j = await getJson<{
    result: { labels: string[]; data: (number | null)[][] };
  }>(
    `${origin}/api/v1/data?chart=${encodeURIComponent(id)}&after=-3&points=1&format=json&options=jsonwrap`
  );
  const row = j.result.data[j.result.data.length - 1] ?? [];
  const out: Row = {};
  j.result.labels.forEach((label, i) => {
    if (i > 0) out[label] = row[i] ?? null;
  });
  return out;
}

async function discover(origin: string): Promise<Discovery> {
  const known = discoveries.get(origin);
  if (known && Date.now() - known.at < DISCOVERY_TTL_MS) return known;

  // Small and quick: fails fast when the machine is asleep or off.
  const info = await getJson<{
    os_name?: string;
    os_version?: string;
    cores_total?: string | number;
  }>(`${origin}/api/v1/info`);
  // The chart list is a few MB: read once, then kept for half an hour.
  const list = await getJson<{ charts: Record<string, unknown> }>(
    `${origin}/api/v1/charts`,
    10000
  );
  const ids = Object.keys(list.charts ?? {});
  const has = (id: string) => ids.includes(id);

  const temps = ids.filter(
    (c) =>
      /^sensors\.temperature_.+_input$/.test(c) || // v2
      /^sensors\..+_temperature$/.test(c) // v1
  );
  const gpu = ids
    .map((c) => c.match(/^(nvidia_smi\.gpu_gpu-[a-f0-9-]+)_gpu_utilization$/))
    .find(Boolean);

  const found: Discovery = {
    at: Date.now(),
    os: info.os_name
      ? [info.os_name, info.os_version?.split(" ")[0]].filter(Boolean).join(" ")
      : null,
    cores: info.cores_total ? Number(info.cores_total) || null : null,
    disk: has("disk_space./")
      ? "disk_space./"
      : has("disk_space._")
        ? "disk_space._"
        : null,
    temp:
      temps.find((c) => /Tctl|Tdie|Package|coretemp|k10temp/i.test(c)) ??
      temps.find((c) => /Composite/i.test(c)) ??
      temps[0] ??
      null,
    gpu: gpu ? gpu[1] : null,
    power: has("power.draw_watts"),
    load: has("system.load"),
    uptime: has("system.uptime"),
    net: has("system.net"),
  };
  discoveries.set(origin, found);
  return found;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const first = (row: Row | undefined): number | null =>
  row
    ? (Object.values(row)
        .map(num)
        .find((v) => v !== null) ?? null)
    : null;

const sum = (row: Row, skip: string[] = []) =>
  Object.entries(row).reduce(
    (a, [k, v]) => (skip.includes(k) ? a : a + (num(v) ?? 0)),
    0
  );

function usage(used: number, total: number, divide = 1): Usage | null {
  if (!total) return null;
  return {
    pct: (used / total) * 100,
    used: used / divide,
    total: total / divide,
  };
}

function offline(error: string): MachineStats {
  return {
    online: false,
    checkedAt: new Date().toISOString(),
    error,
    os: null,
    cores: null,
    cpu: null,
    ram: null,
    disk: null,
    net: null,
    temp: null,
    load: null,
    uptime: null,
    gpu: null,
    power: null,
  };
}

async function read(origin: string): Promise<MachineStats> {
  const d = await discover(origin);

  const wanted: Record<string, string> = {
    cpu: "system.cpu",
    ram: "system.ram",
  };
  if (d.disk) wanted.disk = d.disk;
  if (d.net) wanted.net = "system.net";
  if (d.temp) wanted.temp = d.temp;
  if (d.load) wanted.load = "system.load";
  if (d.uptime) wanted.uptime = "system.uptime";
  if (d.gpu) {
    wanted.gpuUtil = `${d.gpu}_gpu_utilization`;
    wanted.gpuMem = `${d.gpu}_frame_buffer_memory_usage`;
    wanted.gpuTemp = `${d.gpu}_temperature`;
    wanted.gpuWatts = `${d.gpu}_power_draw`;
  }
  if (d.power) {
    wanted.watts = "power.draw_watts";
    wanted.psu = "power.psu_load_percent";
  }

  const keys = Object.keys(wanted);
  const settled = await Promise.allSettled(
    keys.map((k) => chart(origin, wanted[k]))
  );
  const got: Record<string, Row | undefined> = {};
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") got[keys[i]] = r.value;
  });
  // CPU is on every agent: without it, the machine did not really answer.
  if (!got.cpu) {
    const failure = settled.find((r) => r.status === "rejected");
    throw failure && failure.status === "rejected"
      ? failure.reason
      : new Error("no data");
  }

  let ram: Usage | null = null;
  if (got.ram) {
    const r = got.ram;
    const used = num(r.used) ?? 0;
    const total =
      used + (num(r.free) ?? 0) + (num(r.cached) ?? 0) + (num(r.buffers) ?? 0);
    ram = usage(used, total, 1024); // MiB → GiB
  }

  let disk: Usage | null = null;
  if (got.disk) {
    const r = got.disk;
    const used = num(r.used) ?? 0;
    const reserved =
      num(r["reserved for root"]) ?? num(r.reserved_for_root) ?? 0;
    disk = usage(used, used + (num(r.avail) ?? 0) + reserved);
  }

  let temp: number | null = null;
  if (got.temp) {
    const entries = Object.entries(got.temp).filter(([, v]) => num(v) !== null);
    const main = entries.find(([k]) => /Package|Tctl|Tdie|Composite/i.test(k));
    temp = main
      ? num(main[1])
      : entries.length
        ? Math.max(...entries.map(([, v]) => v as number))
        : null;
  }

  let gpu: MachineStats["gpu"] = null;
  if (d.gpu && (got.gpuUtil || got.gpuMem)) {
    const m = got.gpuMem;
    const used = num(m?.used) ?? 0;
    const total = used + (num(m?.free) ?? 0) + (num(m?.reserved) ?? 0);
    gpu = {
      util: first(got.gpuUtil),
      vram: m ? usage(used, total, 1024 ** 3) : null, // bytes → GiB
      temp: first(got.gpuTemp),
      watts: first(got.gpuWatts),
    };
  }

  return {
    online: true,
    checkedAt: new Date().toISOString(),
    os: d.os,
    cores: d.cores,
    cpu: Math.min(100, sum(got.cpu, ["idle"])),
    ram,
    disk,
    net: got.net
      ? {
          rx: Math.abs(num(got.net.received) ?? num(got.net.InOctets) ?? 0),
          tx: Math.abs(num(got.net.sent) ?? num(got.net.OutOctets) ?? 0),
        }
      : null,
    temp,
    load: first(got.load), // load1 comes first
    uptime: first(got.uptime),
    gpu,
    power: got.watts ? { watts: sum(got.watts), load: first(got.psu) } : null,
  };
}

/**
 * Current status of one machine. Never throws: an unreachable one is offline.
 * A recent reading is returned at once and refreshed behind, so a slow machine
 * never holds the dashboard back.
 */
export async function machineStats(statsUrl: string): Promise<MachineStats> {
  const origin = netdataOrigin(statsUrl);
  if (!origin) return offline("invalid address");

  const last = latest.get(origin);
  const age = last ? Date.now() - last.at : Infinity;
  if (last && age < (last.stats.online ? FRESH_MS : OFFLINE_RETRY_MS))
    return last.stats;

  let job = pending.get(origin);
  if (!job) {
    job = read(origin)
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : "";
        return offline(
          name === "TimeoutError" || name === "AbortError"
            ? "no answer"
            : e instanceof Error
              ? e.message
              : String(e)
        );
      })
      .then((stats) => {
        latest.set(origin, { at: Date.now(), stats });
        pending.delete(origin);
        return stats;
      });
    pending.set(origin, job);
  }
  return last && age < STALE_MS ? last.stats : job;
}
