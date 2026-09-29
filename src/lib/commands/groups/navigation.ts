import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
  Calendar,
  ClipboardList,
  FolderGit2,
  Receipt,
  Settings,
  Users,
  Zap,
} from "lucide-react";

import { Command } from "../types";

export function useNavigationCommands(): Command[] {
  return [
    {
      id: "navigation.calendar",
      title: "Go to Calendar",
      keywords: ["navigation"],
      icon: Calendar,
      section: "navigation",
      shortcut: "gc",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/calendar");
      },
    },
    {
      id: "navigation.tasks",
      title: "Go to Tasks",
      keywords: ["navigation"],
      icon: ClipboardList,
      section: "navigation",
      shortcut: "gt",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/tasks");
      },
    },
    {
      id: "navigation.focus",
      title: "Go to Focus",
      keywords: ["navigation"],
      icon: Zap,
      section: "navigation",
      shortcut: "gf",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/focus");
      },
    },
    {
      id: "navigation.fiscalite",
      title: "Go to Fiscalité",
      keywords: ["navigation", "fiscalite", "factures", "invoices", "taxes", "impots"],
      icon: Receipt,
      section: "navigation",
      shortcut: "gi",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/fiscalite");
      },
    },
    {
      id: "navigation.projets",
      title: "Go to Projets",
      keywords: ["navigation", "projects", "projets"],
      icon: FolderGit2,
      section: "navigation",
      shortcut: "gp",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/projets");
      },
    },
    {
      id: "navigation.contacts",
      title: "Go to Contacts",
      keywords: ["navigation", "people", "contacts"],
      icon: Users,
      section: "navigation",
      shortcut: "go",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/contacts");
      },
    },
    {
      id: "navigation.settings",
      title: "Go to Settings",
      keywords: ["navigation"],
      icon: Settings,
      section: "navigation",
      shortcut: "gs",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/settings");
      },
    },
  ];
}
