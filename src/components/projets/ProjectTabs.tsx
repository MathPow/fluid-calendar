"use client";

import { type ReactNode, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ProjectTab = {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
};

/**
 * The sections of a project page as tabs. The active one is mirrored in
 * ?onglet= (replaceState, no navigation) so a reload or a shared link lands
 * on the same tab.
 */
export function ProjectTabs({
  tabs,
  initial,
}: {
  tabs: ProjectTab[];
  initial: string;
}) {
  const [value, setValue] = useState(initial);

  const change = (next: string) => {
    setValue(next);
    const url = new URL(window.location.href);
    if (next === tabs[0]?.value) url.searchParams.delete("onglet");
    else url.searchParams.set("onglet", next);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <Tabs value={value} onValueChange={change} className="mt-8">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-5">
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] tabular-nums">
                  {t.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-0">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
