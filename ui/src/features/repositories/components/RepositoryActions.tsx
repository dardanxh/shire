import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TOOL_NAMES, type ToolName, type ToolRun } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRefreshRepositoryMutation, useRunToolMutation } from "../api";

/**
 * Pull-latest + per-tool run controls. Both are `mutate` + `onSuccess` — the
 * success toast lives here; failures flow to the global MutationCache handler.
 * A blocking refresh can succeed with `status: "failed"`, which we surface as
 * an explicit error toast on the success path (not a mutation error).
 */
export function RepositoryActions({
  id,
  toolRuns,
}: {
  id: string;
  toolRuns: ToolRun[];
}) {
  const { t } = useTranslation();
  const { mutate: refresh, isPending: refreshing } =
    useRefreshRepositoryMutation(id);
  const {
    mutate: runTool,
    isPending: runningTool,
    variables: runningToolName,
  } = useRunToolMutation(id);

  const contributed = new Set(
    toolRuns.filter((tr) => tr.contributed).map((tr) => tr.name),
  );
  const busy = refreshing || runningTool;

  const handleRefresh = () => {
    refresh(undefined, {
      onSuccess: (repo) => {
        if (repo.status === "failed") {
          toast.error(
            t("repositories.actions.refresh_failed", { slug: repo.slug }),
            { description: repo.error ?? undefined },
          );
        } else {
          toast.success(t("repositories.actions.refreshed"));
        }
      },
    });
  };

  const handleRunTool = (tool: ToolName) => {
    runTool(tool, {
      onSuccess: () =>
        toast.success(t("repositories.actions.tool_ran", { tool })),
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {t("repositories.actions.pull_title")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("repositories.actions.pull_desc")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={handleRefresh}
        >
          {refreshing ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
          {refreshing
            ? t("repositories.actions.pulling")
            : t("repositories.actions.pull_button")}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t("repositories.actions.run_title")}
        </p>
        <div className="flex flex-wrap gap-2">
          {TOOL_NAMES.map((tool) => {
            const running = runningTool && runningToolName === tool;
            const muted = !contributed.has(tool);
            return (
              <Button
                key={tool}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => handleRunTool(tool)}
                title={
                  muted
                    ? t("repositories.actions.tool_muted_title", { tool })
                    : undefined
                }
                className={cn(muted && !running && "text-muted-foreground")}
              >
                {running ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : null}
                {running ? t("repositories.actions.running", { tool }) : tool}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
