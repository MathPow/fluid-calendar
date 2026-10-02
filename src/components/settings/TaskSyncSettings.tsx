import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n";
import {
  Calendar,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { format } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";

import { SettingRow, SettingsSection } from "./SettingsSection";

// Logging source
const LOG_SOURCE = "TaskSyncSettings";

// Radix selects can't hold an empty value: this one stands for "nothing picked".
const NONE = "none";

interface OrganisationOption {
  id: string;
  name: string;
  color: string | null;
}

interface ProjetOption {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  organisation: { id: string } | null;
}

/** Where a board's tasks go: both optional, the project needs the organisation. */
interface Destination {
  organisationId: string;
  agentProjectId: string;
}

function OrganisationSelect({
  id,
  value,
  onChange,
  organisations,
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (organisationId: string) => void;
  organisations: OrganisationOption[];
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={t("settings.taskSync.noOrganisation")} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>
          {t("settings.taskSync.noOrganisation")}
        </SelectItem>
        {organisations.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: o.color ?? "#a8ccff" }}
              />
              {o.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Types for providers and mappings
interface TaskProvider {
  id: string;
  type: "OUTLOOK" | "CALDAV" | "GOOGLE" | "GITHUB" | "TRELLO";
  name: string;
  accountId?: string;
  accountEmail?: string; // This will be populated from the account for UI display
  enabled: boolean;
  syncEnabled: boolean;
  syncInterval: string;
  lastSyncedAt?: string | Date;
  defaultProjectId?: string;
  organisationId?: string | null;
  organisation?: { id: string; name: string; color: string | null } | null;
  error?: string;
  settings?: {
    [key: string]: string | number | boolean | undefined;
  };
}

interface TaskList {
  id: string;
  name: string;
  isDefaultFolder?: boolean;
  isMapped: boolean;
  mappingId?: string;
  projectId?: string;
  projectName?: string;
  lastSyncedAt?: string;
  mappingDirection?: "incoming" | "outgoing" | "bidirectional";
}

export function TaskSyncSettings() {
  const { accounts } = useSettingsStore();
  const t = useT();

  // State
  const [providers, setProviders] = useState<TaskProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<TaskProvider | null>(
    null
  );
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("task-lists");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");

  // GitHub-specific state
  const [isGitHubDialogOpen, setIsGitHubDialogOpen] = useState(false);
  const [githubName, setGithubName] = useState("GitHub Projects");
  const [githubToken, setGithubToken] = useState("");
  const [githubLogin, setGithubLogin] = useState("");
  const [githubOwnerType, setGithubOwnerType] = useState<
    "user" | "organization"
  >("user");

  // Trello-specific state
  const [isTrelloDialogOpen, setIsTrelloDialogOpen] = useState(false);
  const [trelloName, setTrelloName] = useState("Trello");
  const [trelloKey, setTrelloKey] = useState("");
  const [trelloToken, setTrelloToken] = useState("");
  const [trelloOrganisation, setTrelloOrganisation] = useState("");
  const [githubOrganisation, setGithubOrganisation] = useState("");

  // Organisations and Projets projects, offered when filing a board
  const [organisations, setOrganisations] = useState<OrganisationOption[]>([]);
  const [projets, setProjets] = useState<ProjetOption[]>([]);
  const [destinations, setDestinations] = useState<Record<string, Destination>>(
    {}
  );

  // Get accounts that can be used as task providers
  const compatibleAccounts = accounts.filter(
    (acc) => acc.provider === "OUTLOOK" || acc.provider === "GOOGLE"
  );
  // Fetch providers
  const fetchProviders = useCallback(async () => {
    setIsLoadingProviders(true);
    setError(null);

    try {
      const response = await fetch("/api/task-sync/providers");
      if (!response.ok) {
        throw new Error("Failed to fetch task providers");
      }

      // API now returns full provider objects directly
      const providers = await response.json();

      // Enrich providers with account emails
      const enrichedProviders = await Promise.all(
        providers.map(async (provider: TaskProvider) => {
          if (provider.accountId) {
            // Find account in local state first
            const account = accounts.find((a) => a.id === provider.accountId);
            if (account) {
              return { ...provider, accountEmail: account.email };
            }

            // If not found in local state, try to fetch from API
            try {
              const accountResponse = await fetch(
                `/api/accounts/${provider.accountId}`
              );
              if (accountResponse.ok) {
                const accountData = await accountResponse.json();
                return { ...provider, accountEmail: accountData.email };
              }
            } catch (e) {
              // Ignore errors from account fetch, we'll just show "Unknown" email
              console.error("Failed to fetch account for provider", e);
            }
          }

          // If we couldn't get an email, show unknown
          return {
            ...provider,
            accountEmail: t("settings.taskSync.unknownAccount"),
          };
        })
      );

      setProviders(enrichedProviders);

      // Open on the connection added last: the one being set up.
      if (enrichedProviders.length > 0 && !selectedProvider) {
        setSelectedProvider(enrichedProviders[enrichedProviders.length - 1]);
      }
    } catch (error) {
      setError(t("settings.taskSync.errors.loadProviders"));
      logger.error(
        "Failed to fetch task providers",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
    } finally {
      setIsLoadingProviders(false);
    }
  }, [accounts, selectedProvider, t]);
  // Load providers and projects when component mounts
  useEffect(() => {
    fetchProviders();
    const { fetchProjects } = useProjectStore.getState();
    fetchProjects();
  }, [fetchProviders]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/organisations").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/projects/link").then((r) =>
        r.ok ? r.json() : { projets: [] }
      ),
    ])
      .then(
        ([orgs, link]: [OrganisationOption[], { projets: ProjetOption[] }]) => {
          if (cancelled) return;
          setOrganisations(orgs);
          setProjets(link.projets ?? []);
        }
      )
      .catch(() => {
        /* the selects stay empty: boards can still sync to a plain list */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A board starts filed under the organisation of its connection.
  const destinationOf = (listId: string): Destination =>
    destinations[listId] ?? {
      organisationId: selectedProvider?.organisationId ?? "",
      agentProjectId: "",
    };

  const setDestination = (listId: string, next: Destination) =>
    setDestinations((all) => ({ ...all, [listId]: next }));

  // Fetch mappings for a provider
  const fetchMappings = useCallback(async (providerId: string) => {
    try {
      const response = await fetch(
        `/api/task-sync/mappings?providerId=${providerId}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch task list mappings");
      }

      // We just fetch but don't need to store the mappings since they're not used
      await response.json();
    } catch (error) {
      logger.error(
        "Failed to fetch task list mappings",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          providerId,
        },
        LOG_SOURCE
      );
    }
  }, []);

  // Fetch task lists for a provider
  const fetchTaskLists = useCallback(
    async (providerId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/task-sync/providers/${providerId}/lists`
        );
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(
            data?.reason || t("settings.taskSync.errors.loadLists")
          );
        }

        const data = await response.json();
        setTaskLists(data);
      } catch (error) {
        // Never leave the boards of another connection on screen.
        setTaskLists([]);
        setError(
          error instanceof Error
            ? error.message
            : t("settings.taskSync.errors.loadLists")
        );
        logger.error(
          "Failed to fetch task lists",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            providerId,
          },
          LOG_SOURCE
        );
      } finally {
        setIsLoading(false);
      }
    },
    [t]
  );

  // Load task lists for the selected provider
  useEffect(() => {
    if (selectedProvider) {
      fetchTaskLists(selectedProvider.id);
      fetchMappings(selectedProvider.id);
    }
  }, [selectedProvider, fetchTaskLists, fetchMappings]);

  // Create a new provider
  const createProvider = async () => {
    if (!newProviderName || !selectedAccount) {
      // Show error toast for missing fields
      toast.error(t("toasts.settings.taskSync.missingNameAccount"));
      return;
    }

    setIsCreating(true);

    try {
      // Find account email for UI display
      const account = accounts.find((acc) => acc.id === selectedAccount);
      const accountEmail =
        account?.email || t("settings.taskSync.unknownAccount");
      const providerType =
        (account?.provider as "OUTLOOK" | "GOOGLE" | undefined) || "OUTLOOK";

      const response = await fetch("/api/task-sync/providers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newProviderName,
          type: providerType,
          settings: {},
          accountId: selectedAccount,
        }),
      });

      if (!response.ok) {
        const responseData = await response.json().catch(() => null);
        console.error("Failed to create provider:", responseData);
        throw new Error("Failed to create task provider");
      }

      // Get the new provider data from response
      const responseData = await response.json();
      const newProvider = responseData.provider ?? responseData;

      // Add the account email to the provider object for display
      const enrichedProvider = {
        ...newProvider,
        accountEmail,
      };

      // Add the new provider to the list and select it
      setProviders([...providers, enrichedProvider]);
      setSelectedProvider(enrichedProvider);
      setNewProviderName("");
      setSelectedAccount("");

      // Show success toast
      toast.success(t("toasts.settings.taskSync.providerCreated"));

      // Close the dialog
      setIsDialogOpen(false);
    } catch (error) {
      setError(t("settings.taskSync.errors.createProvider"));
      logger.error(
        "Failed to create task provider",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
      toast.error(t("toasts.settings.taskSync.createProviderFailed"));
    } finally {
      setIsCreating(false);
    }
  };

  // Connect a Trello provider via API key + token
  const connectTrello = async () => {
    if (!trelloKey || !trelloToken || !trelloName) {
      toast.error(t("toasts.settings.taskSync.trelloMissingFields"));
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/task-sync/trello/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trelloName,
          key: trelloKey,
          token: trelloToken,
          organisationId: trelloOrganisation || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || t("toasts.settings.taskSync.trelloConnectFailed")
        );
      }

      const { provider: newProvider } = await response.json();
      const enriched = {
        ...newProvider,
        accountEmail: `${newProvider.settings?.username ?? "Trello"} (Trello)`,
      };

      setProviders([...providers, enriched]);
      setSelectedProvider(enriched);
      setTrelloKey("");
      setTrelloToken("");
      setTrelloName("Trello");
      setTrelloOrganisation("");
      setIsTrelloDialogOpen(false);
      toast.success(t("toasts.settings.taskSync.trelloConnected"));
    } catch (error) {
      logger.error(
        "Failed to connect Trello provider",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
      toast.error(
        error instanceof Error
          ? error.message
          : t("toasts.settings.taskSync.trelloConnectFailed")
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Connect a GitHub provider via PAT
  const connectGitHub = async () => {
    if (!githubToken || !githubLogin || !githubName) {
      toast.error(t("toasts.settings.taskSync.githubMissingFields"));
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/task-sync/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: githubName,
          token: githubToken,
          login: githubLogin,
          ownerType: githubOwnerType,
          organisationId: githubOrganisation || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || t("toasts.settings.taskSync.githubConnectFailed")
        );
      }

      const { provider: newProvider } = await response.json();
      const enriched = {
        ...newProvider,
        accountEmail: `${githubLogin} (GitHub)`,
      };

      setProviders([...providers, enriched]);
      setSelectedProvider(enriched);
      setGithubToken("");
      setGithubLogin("");
      setGithubName("GitHub Projects");
      setGithubOrganisation("");
      setIsGitHubDialogOpen(false);
      toast.success(t("toasts.settings.taskSync.githubConnected"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toasts.settings.taskSync.githubConnectFailed")
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Link a connection to an organisation, or unlink it
  const setProviderOrganisation = async (
    providerId: string,
    organisationId: string
  ) => {
    try {
      const response = await fetch(`/api/task-sync/providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: organisationId || null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || t("toasts.settings.taskSync.updateConnectionFailed")
        );
      }
      const { provider: updated } = await response.json();
      const merge = (p: TaskProvider): TaskProvider =>
        p.id === providerId
          ? {
              ...p,
              organisationId: updated.organisationId,
              organisation: updated.organisation,
            }
          : p;
      setProviders((all) => all.map(merge));
      setSelectedProvider((p) => (p ? merge(p) : p));
      toast.success(
        updated.organisation
          ? t("toasts.settings.taskSync.linkedTo", {
              name: updated.organisation.name,
            })
          : t("toasts.settings.taskSync.unlinked")
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toasts.settings.taskSync.updateConnectionFailed")
      );
    }
  };

  // Trello: only the cards assigned to me, or every card of the boards
  const setTrelloOnlyMine = async (providerId: string, onlyMine: boolean) => {
    try {
      const response = await fetch(`/api/task-sync/providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { onlyMine } }),
      });
      if (!response.ok)
        throw new Error(t("toasts.settings.taskSync.updateConnectionFailed"));
      const merge = (p: TaskProvider): TaskProvider =>
        p.id === providerId
          ? {
              ...p,
              settings: {
                ...((p.settings as Record<string, unknown>) ?? {}),
                onlyMine,
              },
            }
          : p;
      setProviders((all) => all.map(merge));
      setSelectedProvider((p) => (p ? merge(p) : p));
      toast.success(
        onlyMine
          ? t("toasts.settings.taskSync.onlyMineOn")
          : t("toasts.settings.taskSync.onlyMineOff")
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toasts.settings.taskSync.updateConnectionFailed")
      );
    }
  };

  // Delete a provider
  const deleteProvider = async (providerId: string) => {
    if (!window.confirm(t("settings.taskSync.confirmDeleteProvider"))) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/task-sync/providers/${providerId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task provider");
      }

      toast.success(t("toasts.settings.taskSync.providerDeleted"));

      // Refresh providers
      await fetchProviders();
      setSelectedProvider(null);
    } catch (error) {
      toast.error(t("toasts.settings.taskSync.deleteProviderFailed"));
      logger.error(
        "Failed to delete task provider",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          providerId,
        },
        LOG_SOURCE
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Sync a board: file it where asked (nothing asked: a list named after it)
  const createMapping = async (externalListId: string) => {
    if (!selectedProvider) return;
    const list = taskLists.find((l) => l.id === externalListId);
    const { organisationId, agentProjectId } = destinationOf(externalListId);

    try {
      setIsLoading(true);
      const response = await fetch("/api/task-sync/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selectedProvider.id,
          externalListId,
          externalListName: list?.name || "Unknown List",
          organisationId: organisationId || null,
          agentProjectId: (organisationId && agentProjectId) || null,
          direction: "bidirectional", // Always set to bidirectional
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || t("toasts.settings.taskSync.createMappingFailed")
        );
      }
      const { mapping } = await response.json();

      // The list may be new: let Tasks and Calendar know about it.
      const { fetchProjects } = useProjectStore.getState();
      await fetchProjects();

      // First sync right away, so the cards show up as tasks.
      const sync = await fetch(`/api/task-sync/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingId: mapping.id,
          direction: "bidirectional",
        }),
      });
      toast.success(
        sync.ok
          ? t("toasts.settings.taskSync.mappingSyncing", {
              list: list?.name ?? t("settings.taskSync.board"),
              project: mapping.projectName,
            })
          : t("toasts.settings.taskSync.mappingMapped", {
              list: list?.name ?? t("settings.taskSync.board"),
              project: mapping.projectName,
            })
      );

      // Refresh lists and mappings
      await fetchTaskLists(selectedProvider.id);
      await fetchMappings(selectedProvider.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("toasts.settings.taskSync.createMappingFailed")
      );
      logger.error(
        "Failed to create task list mapping",
        { error: error instanceof Error ? error.message : "Unknown error" },
        LOG_SOURCE
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a mapping
  const deleteMapping = async (mappingId: string) => {
    if (!window.confirm(t("settings.taskSync.confirmDeleteMapping"))) {
      return;
    }

    if (!selectedProvider) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/task-sync/mappings/${mappingId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task list mapping");
      }

      toast.success(t("toasts.settings.taskSync.mappingRemoved"));

      // Refresh lists and mappings
      await fetchTaskLists(selectedProvider.id);
      await fetchMappings(selectedProvider.id);
    } catch (error) {
      toast.error(t("toasts.settings.taskSync.removeMappingFailed"));
      logger.error(
        "Failed to remove task list mapping",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          mappingId,
        },
        LOG_SOURCE
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger sync for the selected provider
  const triggerSync = async (providerId: string) => {
    setIsLoading(true);

    try {
      const provider = providers.find((p) => p.id === providerId);
      const direction = provider?.settings?.direction || "bidirectional";

      const response = await fetch(`/api/task-sync/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerId,
          direction,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to trigger provider sync:", errorData);
        toast.error(t("toasts.settings.taskSync.syncFailed"));
        return;
      }

      const data = await response.json();
      toast.success(t("toasts.settings.taskSync.syncScheduled"));
      console.log("Sync job:", data);
    } catch (error) {
      console.error("Error triggering sync:", error);
      toast.error(t("toasts.settings.taskSync.syncFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Find unused accounts (accounts that are not already task providers)
  const unusedAccounts = compatibleAccounts.filter(
    (account) =>
      !providers.some(
        (provider) =>
          provider.accountEmail === account.email &&
          provider.type === account.provider
      )
  );

  // Trigger sync for a specific mapping
  const triggerMappingSync = async (mappingId: string) => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/task-sync/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mappingId,
          direction: "bidirectional", // Default to bidirectional sync
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to trigger mapping sync:", errorData);
        toast.error(t("toasts.settings.taskSync.syncFailed"));
        return;
      }

      const data = await response.json();
      toast.success(t("toasts.settings.taskSync.syncScheduled"));
      console.log("Sync job:", data);
    } catch (error) {
      console.error("Error triggering sync:", error);
      toast.error(t("toasts.settings.taskSync.syncFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Render the provider selection and creation UI
  const renderProviderSelection = () => {
    return (
      <SettingRow
        label={t("settings.taskSync.provider.label")}
        description={t("settings.taskSync.provider.description")}
      >
        <div className="space-y-4">
          {isLoadingProviders ? (
            <div className="flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">
                {t("settings.taskSync.provider.loading")}
              </span>
            </div>
          ) : (
            <>
              {providers.length > 0 ? (
                <Select
                  value={selectedProvider?.id || ""}
                  onValueChange={(value) => {
                    const provider = providers.find((p) => p.id === value);
                    setSelectedProvider(provider || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("settings.taskSync.provider.placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.organisation
                          ? `${provider.organisation.name} · `
                          : ""}
                        {provider.name} (
                        {provider.type === "GITHUB"
                          ? `${(provider.settings as { login?: string })?.login ?? "GitHub"}`
                          : provider.type === "TRELLO"
                            ? `${(provider.settings as { username?: string })?.username ?? "Trello"}`
                            : provider.accountEmail}
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Alert>
                  <AlertTitle>
                    {t("settings.taskSync.provider.empty.title")}
                  </AlertTitle>
                  <AlertDescription>
                    {t("settings.taskSync.provider.empty.description")}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 pt-2">
                {unusedAccounts.length > 0 && (
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="mr-2 h-4 w-4" />{" "}
                        {t("settings.taskSync.add.outlookGoogle")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {t("settings.taskSync.add.title")}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="name">
                            {t("settings.taskSync.fields.providerName")}
                          </Label>
                          <Input
                            id="name"
                            value={newProviderName}
                            onChange={(e) => setNewProviderName(e.target.value)}
                            placeholder={t(
                              "settings.taskSync.add.namePlaceholder"
                            )}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="account">
                            {t("settings.taskSync.fields.account")}
                          </Label>
                          <Select
                            value={selectedAccount}
                            onValueChange={setSelectedAccount}
                          >
                            <SelectTrigger id="account">
                              <SelectValue
                                placeholder={t(
                                  "settings.taskSync.fields.accountPlaceholder"
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {unusedAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.email} ({account.provider})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          onClick={createProvider}
                          disabled={
                            isCreating || !newProviderName || !selectedAccount
                          }
                        >
                          {isCreating && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {t("settings.taskSync.add.submit")}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

                {/* GitHub provider — always available, uses PAT */}
                <Dialog
                  open={isGitHubDialogOpen}
                  onOpenChange={setIsGitHubDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="mr-2 h-4 w-4" />{" "}
                      {t("settings.taskSync.github.add")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {t("settings.taskSync.github.title")}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="gh-name">
                          {t("settings.taskSync.fields.providerName")}
                        </Label>
                        <Input
                          id="gh-name"
                          value={githubName}
                          onChange={(e) => setGithubName(e.target.value)}
                          placeholder={t(
                            "settings.taskSync.github.namePlaceholder"
                          )}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="gh-token">
                          {t("settings.taskSync.github.token")}
                        </Label>
                        <Input
                          id="gh-token"
                          type="password"
                          value={githubToken}
                          onChange={(e) => setGithubToken(e.target.value)}
                          placeholder="ghp_..."
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("settings.taskSync.github.scopes", {
                            scopes: "read:project + repo",
                          })}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="gh-owner-type">
                          {t("settings.taskSync.github.ownerType")}
                        </Label>
                        <Select
                          value={githubOwnerType}
                          onValueChange={(v) =>
                            setGithubOwnerType(v as "user" | "organization")
                          }
                        >
                          <SelectTrigger id="gh-owner-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">
                              {t("settings.taskSync.github.ownerUser")}
                            </SelectItem>
                            <SelectItem value="organization">
                              {t("settings.taskSync.github.ownerOrganization")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="gh-login">
                          {githubOwnerType === "organization"
                            ? t("settings.taskSync.github.ownerOrganization")
                            : t("settings.taskSync.github.username")}
                        </Label>
                        <Input
                          id="gh-login"
                          value={githubLogin}
                          onChange={(e) => setGithubLogin(e.target.value)}
                          placeholder={
                            githubOwnerType === "organization"
                              ? t("settings.taskSync.github.orgPlaceholder")
                              : t(
                                  "settings.taskSync.github.usernamePlaceholder"
                                )
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="gh-organisation">
                          {t("settings.taskSync.fields.organisationOptional")}
                        </Label>
                        <OrganisationSelect
                          id="gh-organisation"
                          value={githubOrganisation}
                          onChange={setGithubOrganisation}
                          organisations={organisations}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("settings.taskSync.github.organisationHint")}
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsGitHubDialogOpen(false)}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        onClick={connectGitHub}
                        disabled={
                          isCreating ||
                          !githubToken ||
                          !githubLogin ||
                          !githubName
                        }
                      >
                        {isCreating && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t("settings.taskSync.connect")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Trello provider — API key + token, boards map onto projects */}
                <Dialog
                  open={isTrelloDialogOpen}
                  onOpenChange={setIsTrelloDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="mr-2 h-4 w-4" />{" "}
                      {t("settings.taskSync.trello.add")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {t("settings.taskSync.trello.title")}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="trello-name">
                          {t("settings.taskSync.fields.providerName")}
                        </Label>
                        <Input
                          id="trello-name"
                          value={trelloName}
                          onChange={(e) => setTrelloName(e.target.value)}
                          placeholder={t(
                            "settings.taskSync.trello.namePlaceholder"
                          )}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="trello-key">
                          {t("settings.taskSync.trello.apiKey")}
                        </Label>
                        <Input
                          id="trello-key"
                          value={trelloKey}
                          onChange={(e) => setTrelloKey(e.target.value.trim())}
                          placeholder={t(
                            "settings.taskSync.trello.apiKeyPlaceholder"
                          )}
                          autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("settings.taskSync.trello.apiKeyHintBefore")}{" "}
                          <a
                            href="https://trello.com/power-ups/admin"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2"
                          >
                            trello.com/power-ups/admin
                          </a>{" "}
                          {t("settings.taskSync.trello.apiKeyHintAfter")}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="trello-token">
                          {t("settings.taskSync.trello.token")}
                        </Label>
                        <Input
                          id="trello-token"
                          type="password"
                          value={trelloToken}
                          onChange={(e) =>
                            setTrelloToken(e.target.value.trim())
                          }
                          placeholder={t(
                            "settings.taskSync.trello.tokenPlaceholder"
                          )}
                          autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                          {trelloKey ? (
                            <a
                              href={`https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=DreamDash&key=${encodeURIComponent(trelloKey)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2"
                            >
                              {t("settings.taskSync.trello.generateToken")}
                            </a>
                          ) : (
                            t("settings.taskSync.trello.tokenHint")
                          )}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="trello-organisation">
                          {t("settings.taskSync.fields.organisationOptional")}
                        </Label>
                        <OrganisationSelect
                          id="trello-organisation"
                          value={trelloOrganisation}
                          onChange={setTrelloOrganisation}
                          organisations={organisations}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("settings.taskSync.trello.organisationHint")}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.taskSync.trello.explainer")}
                      </p>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsTrelloDialogOpen(false)}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        onClick={connectTrello}
                        disabled={
                          isCreating ||
                          !trelloKey ||
                          !trelloToken ||
                          !trelloName
                        }
                      >
                        {isCreating && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t("settings.taskSync.connect")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </>
          )}
        </div>
      </SettingRow>
    );
  };

  // Render provider details and actions
  const renderProviderDetails = () => {
    if (!selectedProvider) return null;
    const trelloOnlyMine =
      (selectedProvider.settings as { onlyMine?: boolean } | null)?.onlyMine !==
      false;

    return (
      <SettingRow
        label={t("settings.taskSync.details.label")}
        description={t("settings.taskSync.details.description")}
      >
        <Card>
          <CardContent className="space-y-3 pt-6">
            {selectedProvider.type === "TRELLO" && (
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl bg-secondary px-4 py-3">
                <span>
                  <span className="block text-sm font-medium">
                    {t("settings.taskSync.details.onlyMine.title")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("settings.taskSync.details.onlyMine.description")}
                  </span>
                </span>
                <Switch
                  checked={trelloOnlyMine}
                  onCheckedChange={(v) =>
                    setTrelloOnlyMine(selectedProvider.id, v)
                  }
                />
              </label>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.taskSync.details.type")}
                </div>
                <div className="font-medium capitalize">
                  {selectedProvider.type}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.taskSync.fields.account")}
                </div>
                <div className="font-medium">
                  {selectedProvider.type === "GITHUB"
                    ? `${(selectedProvider.settings as { login?: string })?.login ?? "GitHub"}`
                    : selectedProvider.type === "TRELLO"
                      ? `${(selectedProvider.settings as { username?: string })?.username ?? "Trello"}`
                      : selectedProvider.accountEmail}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.taskSync.details.lastSynced")}
                </div>
                <div className="font-medium">
                  {selectedProvider.lastSyncedAt
                    ? format(
                        typeof selectedProvider.lastSyncedAt === "string"
                          ? new Date(selectedProvider.lastSyncedAt)
                          : selectedProvider.lastSyncedAt,
                        "PPp"
                      )
                    : t("settings.taskSync.details.never")}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-sm text-muted-foreground">
                  {t("settings.taskSync.details.organisation")}
                </div>
                <OrganisationSelect
                  value={selectedProvider.organisationId ?? ""}
                  onChange={(organisationId) =>
                    setProviderOrganisation(selectedProvider.id, organisationId)
                  }
                  organisations={organisations}
                  disabled={isLoading}
                  className="mt-1 max-w-sm"
                />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  {t("settings.taskSync.details.autoSync")}
                </div>
                <div className="font-medium">
                  {selectedProvider.syncEnabled
                    ? t("settings.taskSync.details.autoSyncOn")
                    : t("settings.taskSync.details.autoSyncOff")}
                </div>
              </div>
            </div>

            {selectedProvider.error && (
              <Alert variant="destructive">
                <AlertTitle>
                  {t("settings.taskSync.details.syncError")}
                </AlertTitle>
                <AlertDescription>{selectedProvider.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteProvider(selectedProvider.id)}
              disabled={isLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("settings.taskSync.details.deleteProvider")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerSync(selectedProvider.id)}
              disabled={isLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("settings.taskSync.details.syncNow")}
            </Button>
          </CardFooter>
        </Card>
      </SettingRow>
    );
  };

  // Render task lists and mappings
  const renderTaskLists = () => {
    if (!selectedProvider) return null;

    return (
      <SettingRow
        label={t("settings.taskSync.lists.label")}
        description={t("settings.taskSync.lists.description")}
      >
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">
                {t("settings.taskSync.lists.loading")}
              </span>
            </div>
          ) : taskLists.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("settings.taskSync.lists.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {taskLists.map((list) => (
                <Card key={list.id}>
                  <CardContent className="flex items-start justify-between pt-6">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {list.name}
                        {list.isDefaultFolder && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("settings.taskSync.lists.default")}
                          </span>
                        )}
                      </div>
                      {list.isMapped ? (
                        <div className="mt-1 text-sm">
                          <span className="text-muted-foreground">
                            {t("settings.taskSync.lists.mappedTo")}
                          </span>{" "}
                          <span>{list.projectName}</span>
                          {list.lastSyncedAt && (
                            <div className="text-xs text-muted-foreground">
                              {t("settings.taskSync.lists.lastSynced", {
                                date: format(
                                  new Date(list.lastSyncedAt),
                                  "PPp"
                                ),
                              })}
                            </div>
                          )}
                          <div className="mt-2 flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                list.mappingId &&
                                triggerMappingSync(list.mappingId)
                              }
                              disabled={isLoading || !list.mappingId}
                            >
                              <RefreshCw className="mr-1 h-4 w-4" />
                              {t("settings.taskSync.lists.sync")}
                            </Button>
                          </div>
                          <div className="mt-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                list.mappingId && deleteMapping(list.mappingId)
                              }
                              disabled={isLoading}
                            >
                              {t("settings.taskSync.lists.removeMapping")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1">
                          <div className="mb-3 text-sm text-muted-foreground">
                            {t("settings.taskSync.lists.notSynced")}
                          </div>
                          {(() => {
                            const chosen = destinationOf(list.id);
                            const options = projets.filter(
                              (p) =>
                                p.organisation?.id === chosen.organisationId
                            );
                            return (
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                <OrganisationSelect
                                  value={chosen.organisationId}
                                  onChange={(organisationId) =>
                                    setDestination(list.id, {
                                      organisationId,
                                      agentProjectId: "",
                                    })
                                  }
                                  organisations={organisations}
                                  disabled={isLoading}
                                  className="sm:w-[200px]"
                                />
                                <Select
                                  value={chosen.agentProjectId || NONE}
                                  onValueChange={(v) =>
                                    setDestination(list.id, {
                                      ...chosen,
                                      agentProjectId: v === NONE ? "" : v,
                                    })
                                  }
                                  disabled={isLoading || !chosen.organisationId}
                                >
                                  <SelectTrigger
                                    className="sm:w-[220px]"
                                    aria-label={t(
                                      "settings.taskSync.lists.projectAria"
                                    )}
                                  >
                                    <SelectValue
                                      placeholder={
                                        chosen.organisationId
                                          ? t(
                                              "settings.taskSync.lists.noProject"
                                            )
                                          : t(
                                              "settings.taskSync.lists.pickOrganisationFirst"
                                            )
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-72">
                                    <SelectItem value={NONE}>
                                      {chosen.organisationId
                                        ? t("settings.taskSync.lists.noProject")
                                        : t(
                                            "settings.taskSync.lists.pickOrganisationFirst"
                                          )}
                                    </SelectItem>
                                    {options.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        <span className="inline-flex items-center gap-2">
                                          <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{
                                              backgroundColor:
                                                p.color ?? "#a8ccff",
                                            }}
                                          />
                                          {p.parentId && (
                                            <span className="text-muted-foreground">
                                              ↳
                                            </span>
                                          )}
                                          {p.name}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  onClick={() => createMapping(list.id)}
                                  disabled={isLoading}
                                >
                                  <RefreshCw className="mr-1 h-4 w-4" />
                                  {t("settings.taskSync.lists.syncToTasks")}
                                </Button>
                              </div>
                            );
                          })()}
                          <p className="mt-2 text-xs text-muted-foreground">
                            {destinationOf(list.id).agentProjectId
                              ? t("settings.taskSync.lists.destinationProject")
                              : t(
                                  "settings.taskSync.lists.destinationNewList",
                                  {
                                    name: list.name,
                                  }
                                )}
                          </p>
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={list.isMapped ? "default" : "outline"}
                      className="ml-3 shrink-0"
                    >
                      {list.isMapped
                        ? t("settings.taskSync.lists.mapped")
                        : t("settings.taskSync.lists.notMapped")}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </SettingRow>
    );
  };

  // Render sync history
  const renderSyncHistory = () => {
    if (!selectedProvider) return null;

    return (
      <SettingRow
        label={t("settings.taskSync.history.label")}
        description={t("settings.taskSync.history.description")}
      >
        <div className="p-4 text-center text-muted-foreground">
          <p>{t("settings.taskSync.history.comingSoon")}</p>
        </div>
      </SettingRow>
    );
  };

  return (
    <SettingsSection
      title={t("settings.taskSync.title")}
      description={t("settings.taskSync.description")}
    >
      {renderProviderSelection()}

      {selectedProvider && (
        <>
          {renderProviderDetails()}

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="task-lists" className="flex-1">
                <Calendar className="mr-2 h-4 w-4" />
                {t("settings.taskSync.lists.label")}
              </TabsTrigger>
              <TabsTrigger value="sync-history" className="flex-1">
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("settings.taskSync.history.label")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="task-lists" className="mt-0">
              {renderTaskLists()}
            </TabsContent>
            <TabsContent value="sync-history" className="mt-0">
              {renderSyncHistory()}
            </TabsContent>
          </Tabs>
        </>
      )}
    </SettingsSection>
  );
}
