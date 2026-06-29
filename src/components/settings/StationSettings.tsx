"use client";

import { useEffect, useState } from "react";

import { AudioLines, Calendar, Loader2, Mail } from "lucide-react";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { cn } from "@/lib/utils";

type Station = "personal" | "work" | "";

interface MailAccount {
  id: string;
  email: string;
  displayName: string | null;
  station: string | null;
}
interface Feed {
  id: string;
  name: string;
  station: string | null;
}

const STATION_OPTIONS: { value: Station; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "work", label: "Work" },
  { value: "", label: "Unassigned" },
];

/** Segmented Personal/Work/Unassigned picker for one item. */
function StationPicker({
  value,
  saving,
  onChange,
}: {
  value: Station;
  saving: boolean;
  onChange: (v: Station) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
      {saving && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {STATION_OPTIONS.map((o) => (
        <button
          key={o.value || "none"}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StationSettings() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [aRes, fRes] = await Promise.all([
          fetch("/api/mail/accounts"),
          fetch("/api/feeds"),
        ]);
        const a = aRes.ok ? await aRes.json() : { accounts: [] };
        const f = fRes.ok ? await fRes.json() : [];
        setAccounts(a.accounts ?? []);
        setFeeds(Array.isArray(f) ? f : (f.feeds ?? []));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setAccountStation = async (id: string, station: Station) => {
    setSavingId(id);
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, station: station || null } : a))
    );
    try {
      await fetch(`/api/mail/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station: station || null }),
      });
    } finally {
      setSavingId(null);
    }
  };

  const setFeedStation = async (id: string, station: Station) => {
    setSavingId(id);
    setFeeds((prev) =>
      prev.map((f) => (f.id === id ? { ...f, station: station || null } : f))
    );
    try {
      await fetch(`/api/feeds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station: station || null }),
      });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <SettingsSection
      title="Stations"
      description="Tag each email account and calendar as Personal or Work. The Personal / Work / Both switcher in the top bar then filters what you see — without toggling things on and off."
    >
      {/* Email accounts */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-muted-foreground" /> Email accounts
        </h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mail accounts connected.</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.displayName || a.email}
                  </p>
                  {a.displayName && (
                    <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                  )}
                </div>
                <StationPicker
                  value={(a.station as Station) || ""}
                  saving={savingId === a.id}
                  onChange={(v) => setAccountStation(a.id, v)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Calendars */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4 text-muted-foreground" /> Calendars
        </h3>
        {feeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calendars yet.</p>
        ) : (
          <ul className="space-y-2">
            {feeds.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <p className="truncate text-sm font-medium">{f.name}</p>
                <StationPicker
                  value={(f.station as Station) || ""}
                  saving={savingId === f.id}
                  onChange={(v) => setFeedStation(f.id, v)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AudioLines className="h-3.5 w-3.5" />
        Untagged items always show under every station.
      </p>
    </SettingsSection>
  );
}
