"use client";

import { useT } from "@/i18n/client";
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
  const t = useT();
  return (
    <ReorderDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("projects.reorder.title.organisations")}
      description={t("projects.reorder.desc.organisations")}
      items={organisations}
      endpoint="/api/organisations/order"
    />
  );
}
