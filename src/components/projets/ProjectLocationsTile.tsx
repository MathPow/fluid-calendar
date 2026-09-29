"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Pencil, Plus, Server, TerminalSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { terminalUrl, timeAgoFr } from "@/lib/projets/meta";

import { MachineDialog, type MachineLite } from "./MachineDialog";

export type { MachineLite };

export interface LocationRow {
  id: string;
  path: string;
  lastSeenAt: string;
  machine: MachineLite;
}

interface ProjectLocationsTileProps {
  projectId: string;
  locations: LocationRow[];
  machines: MachineLite[];
}

const NEW_MACHINE = "__new__";

/**
 * "Emplacements": every machine the project lives on, with its folder there
 * and a button that opens that machine's web terminal in the folder. Rows are
 * filled by the activity hook; they can also be added by hand.
 */
export function ProjectLocationsTile({
  projectId,
  locations,
  machines,
}: ProjectLocationsTileProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [machineId, setMachineId] = useState<string>("");
  const [path, setPath] = useState("");
  const [editing, setEditing] = useState<MachineLite | null>(null);
  const [creating, setCreating] = useState(false);

  const call = async (url: string, init: RequestInit, done: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[]> };
        };
        const field = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat()[0]
          : undefined;
        throw new Error(field || data.error || `Erreur ${res.status}`);
      }
      toast.success(done);
      router.refresh();
      return true;
    } catch (e) {
      toast.error("Action impossible", {
        description: e instanceof Error ? e.message : undefined,
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addLocation = async () => {
    if (!machineId || !path.trim()) return;
    const ok = await call(
      `/api/projets/${projectId}/locations`,
      {
        method: "POST",
        body: JSON.stringify({ machineId, path: path.trim() }),
      },
      "Emplacement enregistré."
    );
    if (ok) {
      setAdding(false);
      setPath("");
      setMachineId("");
    }
  };

  const free = machines.filter(
    (m) => !locations.some((l) => l.machine.id === m.id)
  );

  return (
    <section className="tile mt-5 p-7 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="etiquette">Emplacements</p>
          <span className="text-[12px] text-muted-foreground">
            {locations.length} machine{locations.length > 1 ? "s" : ""}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus /> Ajouter
        </Button>
      </div>

      {locations.length === 0 && !adding && (
        <p className="mt-4 max-w-xl text-[14px] text-muted-foreground">
          Aucun emplacement connu. Ils s&apos;ajoutent tout seuls quand Claude
          travaille dans le dossier du projet sur une machine équipée du hook,
          ou à la main avec « Ajouter ».
        </p>
      )}

      {locations.length > 0 && (
        <ul className="mt-4">
          {locations.map((l) => {
            const url = terminalUrl(l.machine.ttydUrl, l.path);
            return (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-3 border-b border-border py-3.5 last:border-b-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                  <Server className="h-4 w-4" />
                </span>
                {/* On a phone the path gets the whole row; actions wrap below. */}
                <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
                  <p className="flex items-center gap-2 text-[15px] font-semibold tracking-title">
                    <span className="truncate">
                      {l.machine.label || l.machine.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(l.machine)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={`Modifier la machine ${l.machine.label || l.machine.name}`}
                      title="Nom et adresse du terminal"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </p>
                  <p
                    className="break-all font-mono text-[12px] text-muted-foreground sm:truncate sm:break-normal"
                    title={l.path}
                  >
                    {l.path}
                  </p>
                </div>
                <div className="flex w-full items-center gap-3 pl-12 sm:w-auto sm:pl-0">
                  <span className="mr-auto text-[12px] text-muted-foreground sm:mr-0">
                    vu {timeAgoFr(l.lastSeenAt)}
                  </span>
                  {url ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <TerminalSquare /> Terminal
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(l.machine)}
                    >
                      Ajouter l&apos;adresse du terminal
                    </Button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      window.confirm("Retirer cet emplacement ?") &&
                      call(
                        `/api/projets/${projectId}/locations?locationId=${encodeURIComponent(l.id)}`,
                        { method: "DELETE" },
                        "Emplacement retiré."
                      )
                    }
                    className="rounded-full p-2 text-muted-foreground hover:bg-negative hover:text-negative-foreground"
                    aria-label="Retirer l'emplacement"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="mt-4 grid gap-2 rounded-2xl bg-secondary/60 p-3 sm:grid-cols-[14rem_1fr_auto]">
          <Select
            value={machineId}
            onValueChange={(v) => {
              if (v === NEW_MACHINE) {
                setCreating(true);
                return;
              }
              setMachineId(v);
            }}
          >
            <SelectTrigger className="h-10 bg-card">
              <SelectValue placeholder="Machine" />
            </SelectTrigger>
            <SelectContent>
              {free.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label || m.name}
                </SelectItem>
              ))}
              <SelectItem value={NEW_MACHINE}>+ Nouvelle machine…</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/srv/apps/dehors"
            className="h-10 bg-card font-mono text-[13px]"
          />
          <Button
            className="h-10"
            onClick={addLocation}
            disabled={busy || !machineId || !path.trim()}
          >
            Enregistrer
          </Button>
        </div>
      )}

      <MachineDialog
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={!!editing || creating}
        machine={editing}
        busy={busy}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={async (values) => {
          const ok = editing
            ? await call(
                `/api/machines/${editing.id}`,
                { method: "PATCH", body: JSON.stringify(values) },
                "Machine mise à jour."
              )
            : await call(
                "/api/machines",
                { method: "POST", body: JSON.stringify(values) },
                "Machine ajoutée."
              );
          if (ok) {
            setEditing(null);
            setCreating(false);
          }
        }}
      />
    </section>
  );
}
