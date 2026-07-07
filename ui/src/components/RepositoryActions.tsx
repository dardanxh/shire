"use client";

import { useState } from "react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ApiError,
  getAnalysis,
  refreshRepository,
  runTool,
  TOOL_NAMES,
  type AnalysisOut,
  type RepositoryOut,
  type ToolName,
  type ToolRun,
} from "@/lib/api";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export function RepositoryActions({
  id,
  toolRuns,
  onRefreshed,
  onAnalysisUpdated,
}: {
  id: string;
  /** Tool runs from the current analysis, used to mark muted (non-contributed) tools. */
  toolRuns: ToolRun[];
  /** Called with the fresh repo + analysis after a successful pull. */
  onRefreshed: (repo: RepositoryOut, analysis: AnalysisOut | null) => void;
  /** Called with the updated analysis after a successful tool run. */
  onAnalysisUpdated: (analysis: AnalysisOut) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [runningTool, setRunningTool] = useState<ToolName | null>(null);

  const contributed = new Set(
    toolRuns.filter((t) => t.contributed).map((t) => t.name),
  );

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const repo = await refreshRepository(id);
      if (repo.status === "failed") {
        toast.error(`Refresh failed for ${repo.slug}`, {
          description: repo.error ?? "The repository could not be analyzed.",
        });
        onRefreshed(repo, null);
        return;
      }
      let analysis: AnalysisOut | null = null;
      try {
        analysis = await getAnalysis(id);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
      onRefreshed(repo, analysis);
      toast.success("Refreshed");
    } catch (err) {
      toast.error("Could not refresh repository", {
        description: errorMessage(err),
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRunTool(tool: ToolName) {
    if (runningTool) return;
    setRunningTool(tool);
    try {
      const analysis = await runTool(id, tool);
      onAnalysisUpdated(analysis);
      toast.success(`${tool} ran`);
    } catch (err) {
      toast.error(`Could not run ${tool}`, { description: errorMessage(err) });
    } finally {
      setRunningTool(null);
    }
  }

  const busy = refreshing || runningTool !== null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Pull latest</p>
          <p className="text-xs text-muted-foreground">
            Fetch new commits and re-run the full analysis.
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
          {refreshing ? "Pulling…" : "Pull latest"}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Run a tool</p>
        <div className="flex flex-wrap gap-2">
          {TOOL_NAMES.map((tool) => {
            const running = runningTool === tool;
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
                    ? `${tool} did not contribute to the current analysis`
                    : undefined
                }
                className={cn(muted && !running && "text-muted-foreground")}
              >
                {running ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : null}
                {running ? `Running ${tool}…` : tool}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
