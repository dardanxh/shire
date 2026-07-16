import { ExternalLinkIcon, TerminalIcon, ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HomeStatusOut } from "@/lib/api";
import { cn } from "@/lib/utils";

const CLAUDE_INSTALL_URL = "https://code.claude.com/docs/en/quickstart";

/** Claude CLI + engine health — the substrate everything else runs on. */
export function SystemStatusCard({ status }: { status: HomeStatusOut }) {
  const { t } = useTranslation();
  const { claude, engine } = status;

  return (
    <Card className="gap-4 p-5">
      <h2 className="text-sm font-semibold">{t("home.system.title")}</h2>

      {claude.installed ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <TerminalIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{t("home.system.claude_ok")}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {claude.version}
          </span>
          <Badge variant="outline" className="font-mono">
            {t("home.system.default_model", { model: claude.default_model })}
          </Badge>
        </div>
      ) : (
        <div className="rounded-md border border-red-500/25 bg-red-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
            <TerminalIcon className="size-4" />
            {t("home.system.claude_missing_title")}
          </p>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-400/90">
            {t("home.system.claude_missing_body")}
          </p>
          <a
            href={CLAUDE_INSTALL_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-700 underline dark:text-red-400"
          >
            {t("home.system.claude_install_link")}
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ZapIcon
          className={cn(
            "size-4",
            engine.running
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400",
          )}
        />
        <span className="font-medium">
          {engine.running
            ? t("home.system.engine_running")
            : t("home.system.engine_stopped")}
        </span>
        {engine.detail ? (
          <span className="text-xs text-muted-foreground">
            {t(
              `home.system.engine_detail.${engine.detail.replaceAll(" ", "_")}`,
              {
                defaultValue: engine.detail,
              },
            )}
          </span>
        ) : null}
        {!engine.running ? (
          <span className="text-xs text-muted-foreground">
            {t("home.system.engine_hint")}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
