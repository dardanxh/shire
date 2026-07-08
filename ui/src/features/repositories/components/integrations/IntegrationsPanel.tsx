import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Link2Icon,
  Link2OffIcon,
  Loader2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncToolsButton, useToolsQuery } from "@/features/tools";
import type { ToolStatusOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useAnalysisQuery,
  useCodeAgeQuery,
  useCodeMapQuery,
  useCouplingQuery,
  useGraphQuery,
  useLinkIntegrationMutation,
  useRepoIntegrationsQuery,
  useUnlinkIntegrationMutation,
} from "../../api";
import {
  categoryStyle,
  INTEGRATION_DETAIL,
  integrationIcon,
  languageStyle,
} from "./registry";
import { ScorecardIntegration } from "./ScorecardIntegration";

// Display order for the category groups in the catalog.
const CATEGORY_ORDER = [
  "visualization",
  "history",
  "metrics",
  "security",
  "health",
  "analysis",
];

interface IntegrationState {
  generated: boolean;
  when: string | null;
}

/**
 * Integrations hub: a backend-driven catalog of every wired-in tool. Shows the
 * grid of cards, or — when a tool is selected (?tool=) — that tool's focused
 * view with its trigger and output. One place to see what each integration
 * provides and to manage its runs.
 */
export function IntegrationsPanel({
  repoId,
  selectedTool,
  onSelectTool,
}: {
  repoId: string;
  selectedTool: string | undefined;
  onSelectTool: (tool: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { data: tools, isPending } = useToolsQuery();
  const { data: analysis } = useAnalysisQuery(repoId);
  const { data: linkedIds } = useRepoIntegrationsQuery(repoId);
  const { mutate: link, isPending: linking } =
    useLinkIntegrationMutation(repoId);
  const { mutate: unlink, isPending: unlinking } =
    useUnlinkIntegrationMutation(repoId);
  const linked = new Set(linkedIds ?? []);

  // Category filter — null means "All"; LINKED_FILTER shows only linked integrations.
  const [category, setCategory] = useState<string | null>(null);

  // Artifact/data tools expose per-repo "generated" state via their own queries.
  const graph = useGraphQuery(repoId);
  const codeAge = useCodeAgeQuery(repoId);
  const coupling = useCouplingQuery(repoId);
  const codeMap = useCodeMapQuery(repoId);

  const vizState: Record<string, IntegrationState | undefined> = {
    emerge: state(graph.data?.generated, graph.data?.generated_at),
    "git-of-theseus": state(
      codeAge.data?.generated,
      codeAge.data?.generated_at,
    ),
    "code-maat": state(coupling.data?.generated, coupling.data?.generated_at),
    codecharta: state(codeMap.data?.generated, codeMap.data?.generated_at),
  };

  const selected = tools?.find((tool) => tool.id === selectedTool);

  // --- detail view -----------------------------------------------------------
  if (selectedTool && selected) {
    const detail = INTEGRATION_DETAIL[selected.id];
    const isLinked = linked.has(selected.id);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="-ml-2"
            onClick={() => onSelectTool(undefined)}
          >
            <ArrowLeftIcon className="size-4" />
            {t("repositories.integrations.back")}
          </Button>
          {isLinked ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={unlinking}
              className="text-muted-foreground"
              onClick={() =>
                unlink(selected.id, {
                  onSuccess: () =>
                    toast.success(
                      t("repositories.integrations.unlinked", {
                        tool: selected.id,
                      }),
                    ),
                })
              }
            >
              {unlinking ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <Link2OffIcon className="size-3.5" />
              )}
              {t("repositories.integrations.unlink")}
            </Button>
          ) : null}
        </div>
        {!isLinked ? (
          <LinkPrompt
            tool={selected}
            linking={linking}
            onLink={() =>
              link(selected.id, {
                onSuccess: () =>
                  toast.success(
                    t("repositories.integrations.linked", {
                      tool: selected.id,
                    }),
                  ),
              })
            }
          />
        ) : detail ? (
          detail(repoId)
        ) : (
          <ScorecardIntegration
            repoId={repoId}
            tool={selected}
            toolRun={analysis?.tool_runs.find(
              (r) => r.name === selected.id || r.name === selected.name,
            )}
            analysis={analysis}
          />
        )}
      </div>
    );
  }

  // --- catalog grid ----------------------------------------------------------
  if (isPending || !tools) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const sorted = [...tools].sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      a.id.localeCompare(b.id),
  );

  // Categories present in the catalog, in display order — drives the filter bar.
  const categories = [...new Set(sorted.map((tool) => tool.category))];
  const visible =
    category === LINKED_FILTER
      ? sorted.filter((tool) => linked.has(tool.id))
      : category
        ? sorted.filter((tool) => tool.category === category)
        : sorted;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label={t("repositories.integrations.filter_all")}
            active={category === null}
            onClick={() => setCategory(null)}
          />
          <FilterChip
            label={t("repositories.integrations.filter_linked")}
            active={category === LINKED_FILTER}
            onClick={() => setCategory(LINKED_FILTER)}
          />
          {categories.map((c) => (
            <FilterChip
              key={c}
              label={c}
              active={category === c}
              className={cn("capitalize", category === c && categoryStyle(c))}
              onClick={() => setCategory(c)}
            />
          ))}
        </div>
        <SyncToolsButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((tool) => (
          <IntegrationCard
            key={tool.id}
            tool={tool}
            state={vizState[tool.id]}
            linked={linked.has(tool.id)}
            linking={linking}
            toolRunContributed={
              analysis?.tool_runs.find(
                (r) => r.name === tool.id || r.name === tool.name,
              )?.contributed
            }
            onClick={() => onSelectTool(tool.id)}
            onLink={() =>
              link(tool.id, {
                onSuccess: () =>
                  toast.success(
                    t("repositories.integrations.linked", { tool: tool.id }),
                  ),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

const LINKED_FILTER = "__linked__";

function FilterChip({
  label,
  active,
  className,
  onClick,
}: {
  label: string;
  active: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
        active
          ? "border-foreground/10 bg-muted text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {label}
    </button>
  );
}

function IntegrationCard({
  tool,
  state: vizState,
  linked,
  linking,
  toolRunContributed,
  onClick,
  onLink,
}: {
  tool: ToolStatusOut;
  state: IntegrationState | undefined;
  linked: boolean;
  linking: boolean;
  toolRunContributed: boolean | undefined;
  onClick: () => void;
  onLink: () => void;
}) {
  const { t } = useTranslation();
  const Icon = integrationIcon(tool.id);

  // Ready state: viz tools -> generated; scorecard tools -> contributed to analysis.
  const ready = vizState ? vizState.generated : (toolRunContributed ?? false);
  const when = vizState?.when ?? null;

  return (
    <Card
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col gap-2 p-4 transition-colors hover:border-ring hover:bg-muted/30",
        !linked && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{tool.id}</span>
        <Badge
          variant="outline"
          className={cn("ml-auto capitalize", languageStyle(tool.language))}
        >
          {tool.language}
        </Badge>
        <Badge
          variant="outline"
          className={cn("capitalize", categoryStyle(tool.category))}
        >
          {tool.category}
        </Badge>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {tool.purpose}
      </p>
      <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs">
        {!linked ? (
          <Button
            size="sm"
            variant="outline"
            disabled={linking}
            className="h-7"
            onClick={(e) => {
              e.stopPropagation();
              onLink();
            }}
          >
            <Link2Icon className="size-3.5" />
            {t("repositories.integrations.link")}
          </Button>
        ) : !tool.available ? (
          <span className="text-muted-foreground">
            {t("repositories.integrations.not_installed")}
          </span>
        ) : ready ? (
          <>
            <CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">
              {when
                ? t("repositories.integrations.ran_at", {
                    when: formatDateTime(when),
                  })
                : t("repositories.integrations.ready")}
            </span>
          </>
        ) : (
          <>
            <CircleDashedIcon className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              {t("repositories.integrations.not_run")}
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

/** Shown in the detail view when the selected integration isn't linked to the repo. */
function LinkPrompt({
  tool,
  linking,
  onLink,
}: {
  tool: ToolStatusOut;
  linking: boolean;
  onLink: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <div>
        <p className="font-medium">
          {t("repositories.integrations.not_linked_title", { tool: tool.id })}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("repositories.integrations.not_linked_body")}
        </p>
      </div>
      <Button size="sm" disabled={linking} onClick={onLink}>
        {linking ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <Link2Icon className="size-3.5" />
        )}
        {t("repositories.integrations.link")}
      </Button>
    </Card>
  );
}

function state(
  generated: boolean | undefined,
  when: string | null | undefined,
): IntegrationState {
  return { generated: generated ?? false, when: when ?? null };
}

function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
