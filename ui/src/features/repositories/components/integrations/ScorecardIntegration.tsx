import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TOOL_NAMES,
  type ToolName,
  type ToolRun,
  type ToolStatusOut,
} from "@/lib/api";
import { useRunToolMutation } from "../../api";
import type { RepositoryTab } from "../../tabs";
import { integrationIcon, SCORECARD_TAB } from "./registry";

/**
 * Generic detail view for a "scorecard" integration (scanners like scc, osv,
 * gitleaks). Their output is woven into the scorecard tabs, so here we show what
 * the tool provides, its run status, a trigger, and a jump to where its data
 * appears — the manage-in-one-place surface for tools without a bespoke view.
 */
export function ScorecardIntegration({
  repoId,
  tool,
  toolRun,
  onViewTab,
}: {
  repoId: string;
  tool: ToolStatusOut;
  toolRun: ToolRun | undefined;
  onViewTab: (tab: RepositoryTab) => void;
}) {
  const { t } = useTranslation();
  const { mutate: runTool, isPending: running } = useRunToolMutation(repoId);

  const Icon = integrationIcon(tool.id);
  const runnable = (TOOL_NAMES as readonly string[]).includes(tool.id);
  const targetTab = SCORECARD_TAB[tool.id];

  const handleRun = () => {
    runTool(tool.id as ToolName, {
      onSuccess: () =>
        toast.success(
          t("repositories.integrations.toast_ran", { tool: tool.id }),
        ),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4" />
            {tool.id}
            <Badge variant="secondary" className="capitalize">
              {tool.category}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{tool.purpose}</p>
        </div>
        {tool.available && runnable ? (
          <Button
            size="sm"
            variant="outline"
            disabled={running}
            onClick={handleRun}
          >
            {running ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            {running
              ? t("repositories.integrations.running")
              : t("repositories.integrations.run")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!tool.available ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>{t("repositories.integrations.unavailable")}</p>
            <code className="mt-1 block font-mono text-xs">{tool.install}</code>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            {toolRun?.contributed ? (
              <>
                <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t("repositories.integrations.contributed")}</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("repositories.integrations.not_run")}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {targetTab ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onViewTab(targetTab)}
            >
              {t("repositories.integrations.view_in", {
                tab: t(`repositories.view.tabs.${targetTab}`),
              })}
              <ArrowRightIcon className="size-3.5" />
            </Button>
          ) : null}
          <a
            href={tool.homepage}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {tool.homepage}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
