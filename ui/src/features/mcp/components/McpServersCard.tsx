import {
  Loader2Icon,
  PlugIcon,
  RefreshCwIcon,
  ServerOffIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimeAgo } from "@/lib/format";
import { useMcpServersQuery, useRefreshMcpMutation } from "../api";
import { McpStatusBadge } from "./McpStatusBadge";

/**
 * The MCP servers Claude can reach on the host runner — the connectors
 * Launchpad actions use. Status comes from `claude mcp list` (run by the host
 * runner), so the card explains when the runner is the missing piece.
 */
export function McpServersCard() {
  const { t } = useTranslation();
  const { data, isPending } = useMcpServersQuery();
  const { mutate: refresh, isPending: isRefreshing } = useRefreshMcpMutation();
  const probing =
    isRefreshing ||
    data?.probe_status === "pending" ||
    data?.probe_status === "running";

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{t("mcp.card.title")}</h2>
        {data?.checked_at ? (
          <span className="text-xs text-muted-foreground">
            {t("mcp.card.checked", { ago: formatTimeAgo(data.checked_at) })}
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={probing || !data?.host_runner_running}
          onClick={() => refresh()}
        >
          {probing ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
          {probing ? t("mcp.card.probing") : t("mcp.card.refresh")}
        </Button>
      </div>

      {isPending ? <Skeleton className="h-24 w-full" /> : null}

      {data && !data.host_runner_running ? (
        <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
            <ServerOffIcon className="size-4" />
            {t("mcp.card.runner_offline_title")}
          </p>
          <p className="mt-1 text-amber-700/90 dark:text-amber-400/90">
            {t("mcp.card.runner_offline_body")}
          </p>
          <code className="mt-2 block rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
            scripts/host-runner.sh
          </code>
        </div>
      ) : null}

      {data?.probe_status === "failed" && data.probe_error ? (
        <p className="text-sm text-destructive">{data.probe_error}</p>
      ) : null}

      {data && data.servers.length === 0 && data.host_runner_running ? (
        <p className="text-sm text-muted-foreground">
          {probing ? t("mcp.card.first_probe") : t("mcp.card.empty")}
        </p>
      ) : null}

      {data && data.servers.length > 0 ? (
        <ul className="divide-y divide-border">
          {data.servers.map((server) => (
            <li
              key={server.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
            >
              <PlugIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{server.name}</span>
              <McpStatusBadge status={server.status} />
              {server.status === "connected" && server.tool_count > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t("mcp.card.tools", {
                    count: server.tool_count,
                    writes: server.write_tool_count,
                  })}
                </span>
              ) : null}
              {server.status === "needs_auth" ? (
                <span className="text-xs text-muted-foreground">
                  {t("mcp.card.needs_auth_hint")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
