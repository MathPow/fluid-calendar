"use client";

import type { OrganisationLite } from "@/lib/projets/queries";

import { ReorderDialog } from "./ReorderDialog";

/**
 * Put the organisations in the order they should appear everywhere: Projets,
 * the calendar sidebar and Tasks.
 */
export function OrganisationOrderDialog({
  open,
  onOpenChange,
  organisations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In their current display order. */
  organisations: OrganisationLite[];
}) {
  return (
    <ReorderDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ordre des organisations"
      description="Le même ordre s'applique dans Projets, le calendrier et les tâches."
      items={organisations}
      endpoint="/api/organisations/order"
    />
  );
}
