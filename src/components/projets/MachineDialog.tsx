"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MachineLite {
  id: string;
  name: string;
  label: string | null;
  ttydUrl: string | null;
  statsUrl: string | null;
}

export interface MachineValues {
  name: string;
  label: string | null;
  ttydUrl: string | null;
  statsUrl: string | null;
}

/**
 * Add or edit a machine. Give it a `key` that changes with the machine being
 * edited so the fields start from the right values.
 */
export function MachineDialog({
  open,
  machine,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  machine: MachineLite | null;
  busy: boolean;
  onClose: () => void;
  onSave: (values: MachineValues) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(machine?.name ?? "");
  const [label, setLabel] = useState(machine?.label ?? "");
  const [ttydUrl, setTtydUrl] = useState(machine?.ttydUrl ?? "");
  const [statsUrl, setStatsUrl] = useState(machine?.statsUrl ?? "");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {machine ? "Modifier la machine" : "Nouvelle machine"}
          </DialogTitle>
          <DialogDescription>
            L&apos;adresse du terminal ouvre le bon ttyd dans le dossier du
            projet; celle des stats alimente l&apos;état des machines sur le
            tableau de bord.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave({
              name: name.trim(),
              label: label.trim() || null,
              ttydUrl: ttydUrl.trim() || null,
              statsUrl: statsUrl.trim() || null,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="machine-name">Nom d&apos;hôte</Label>
            <Input
              id="machine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vps-dehors"
              className="font-mono text-[13px]"
            />
            <p className="text-[12px] text-muted-foreground">
              Celui que renvoie la commande <code>hostname</code> sur la machine
              : le hook s&apos;en sert pour la reconnaître.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-label">Nom affiché</Label>
            <Input
              id="machine-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VPS Dehors"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-ttyd">Adresse du terminal (ttyd)</Label>
            <Input
              id="machine-ttyd"
              value={ttydUrl}
              onChange={(e) => setTtydUrl(e.target.value)}
              placeholder="https://vps-dehors.taila15d52.ts.net:7681/"
              inputMode="url"
              className="font-mono text-[13px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-stats">Adresse des stats (Netdata)</Label>
            <Input
              id="machine-stats"
              value={statsUrl}
              onChange={(e) => setStatsUrl(e.target.value)}
              placeholder="http://100.76.192.10:19999"
              inputMode="url"
              className="font-mono text-[13px]"
            />
            <p className="text-[12px] text-muted-foreground">
              Avec l&apos;adresse IP Tailscale de la machine (
              <code>tailscale ip -4</code>) plutôt que son nom : c&apos;est le
              serveur de DreamDash qui la lit.
            </p>
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-5">
            {machine && onDelete && (
              <Button
                type="button"
                variant="ghost"
                className="text-negative-foreground hover:bg-negative hover:text-negative-foreground"
                onClick={onDelete}
                disabled={busy}
              >
                Supprimer
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              onClick={onClose}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
