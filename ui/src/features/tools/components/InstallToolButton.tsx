import { DownloadIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { ToolStatusOut } from "@/lib/api";
import { useInstallToolMutation } from "../api";

/**
 * One-click install for a missing tool. Renders nothing for available tools;
 * disabled with a "requires <runner>" hint when the runner binary is absent;
 * spins while the background install runs; on failure surfaces the error and
 * defers to the manual command (which the surrounding card always shows).
 */
export function InstallToolButton({ tool }: { tool: ToolStatusOut }) {
  const { t } = useTranslation();
  const { mutate: installTool, isPending } = useInstallToolMutation();

  if (tool.available || !tool.installer) return null;

  if (tool.install_status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin text-primary" />
        {t("tools.install.running")}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => installTool(tool.id)}
        disabled={isPending || !tool.installable}
        title={
          tool.installable
            ? undefined
            : t("tools.install.needs_runner", { runner: tool.installer })
        }
      >
        <DownloadIcon className="size-3.5" />
        {tool.install_status === "failed"
          ? t("tools.install.retry")
          : t("tools.install.install")}
      </Button>
      {!tool.installable ? (
        <p className="text-xs text-muted-foreground">
          {t("tools.install.needs_runner", { runner: tool.installer })}
        </p>
      ) : null}
      {tool.install_status === "failed" && tool.install_error ? (
        <p className="flex max-w-md items-start gap-1 text-xs text-red-600 dark:text-red-400">
          <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-3 break-all">
            {tool.install_error} — {t("tools.install.fallback_hint")}
          </span>
        </p>
      ) : null}
    </div>
  );
}
