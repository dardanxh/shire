import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type AnalysisOut,
  TOOL_NAMES,
  type ToolName,
  type ToolRun,
  type ToolStatusOut,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRunToolMutation } from "../../api";
import { categoryStyle, integrationIcon, languageStyle } from "./registry";
import { SCORECARD_DATA_IDS, ScorecardData } from "./ScorecardData";

/**
 * Detail view for a "scorecard" integration (scanners like scc, lizard, osv,
 * gitleaks). Their output feeds the scorecard tabs, but here we render the
 * tool's own contributed data inline so the integration is self-contained —
 * plus what it provides, its run status, and a trigger.
 */
export function ScorecardIntegration({
  repoId,
  tool,
  toolRun,
  analysis,
}: {
  repoId: string;
  tool: ToolStatusOut;
  toolRun: ToolRun | undefined;
  analysis: AnalysisOut | null | undefined;
}) {
  const { t } = useTranslation();
  const { mutate: runTool, isPending: running } = useRunToolMutation(repoId);

  const Icon = integrationIcon(tool.id);
  const runnable = (TOOL_NAMES as readonly string[]).includes(tool.id);
  const hasData = SCORECARD_DATA_IDS.has(tool.id);

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
            <Badge
              variant="outline"
              className={cn("capitalize", languageStyle(tool.language))}
            >
              {tool.language}
            </Badge>
            <Badge
              variant="outline"
              className={cn("capitalize", categoryStyle(tool.category))}
            >
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

        {/* The tool's own data, rendered inline. */}
        {tool.available && hasData ? (
          analysis ? (
            <ScorecardData
              repoId={repoId}
              toolId={tool.id}
              analysis={analysis}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("repositories.integrations.data.empty")}
            </p>
          )
        ) : null}

        <a
          href={tool.homepage}
          target="_blank"
          rel="noreferrer"
          className="block text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {tool.homepage}
        </a>
      </CardContent>
    </Card>
  );
}
