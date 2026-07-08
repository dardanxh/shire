import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToolsQuery } from "@/features/tools";
import type { ToolStatusOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  useAnalysisQuery,
  useCodeAgeQuery,
  useCodeMapQuery,
  useCouplingQuery,
  useGraphQuery,
} from "../../api";
import type { RepositoryTab } from "../../tabs";
import { INTEGRATION_DETAIL, integrationIcon } from "./registry";
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
  onViewTab,
}: {
  repoId: string;
  selectedTool: string | undefined;
  onSelectTool: (tool: string | undefined) => void;
  onViewTab: (tab: RepositoryTab) => void;
}) {
  const { t } = useTranslation();
  const { data: tools, isPending } = useToolsQuery();
  const { data: analysis } = useAnalysisQuery(repoId);

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
    return (
      <div className="space-y-4">
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2"
          onClick={() => onSelectTool(undefined)}
        >
          <ArrowLeftIcon className="size-4" />
          {t("repositories.integrations.back")}
        </Button>
        {detail ? (
          detail(repoId)
        ) : (
          <ScorecardIntegration
            repoId={repoId}
            tool={selected}
            toolRun={analysis?.tool_runs.find(
              (r) => r.name === selected.id || r.name === selected.name,
            )}
            onViewTab={onViewTab}
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

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((tool) => (
        <IntegrationCard
          key={tool.id}
          tool={tool}
          state={vizState[tool.id]}
          toolRunContributed={
            analysis?.tool_runs.find(
              (r) => r.name === tool.id || r.name === tool.name,
            )?.contributed
          }
          onClick={() => onSelectTool(tool.id)}
        />
      ))}
    </div>
  );
}

function IntegrationCard({
  tool,
  state: vizState,
  toolRunContributed,
  onClick,
}: {
  tool: ToolStatusOut;
  state: IntegrationState | undefined;
  toolRunContributed: boolean | undefined;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = integrationIcon(tool.id);

  // Ready state: viz tools -> generated; scorecard tools -> contributed to analysis.
  const ready = vizState ? vizState.generated : (toolRunContributed ?? false);
  const when = vizState?.when ?? null;

  return (
    <Card
      onClick={onClick}
      className="flex cursor-pointer flex-col gap-2 p-4 transition-colors hover:border-ring hover:bg-muted/30"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{tool.id}</span>
        <Badge variant="secondary" className="ml-auto capitalize">
          {tool.category}
        </Badge>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {tool.purpose}
      </p>
      <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs">
        {!tool.available ? (
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
