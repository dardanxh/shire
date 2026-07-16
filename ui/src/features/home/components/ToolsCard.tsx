import { Link } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InstallToolButton } from "@/features/tools";
import { useToolsQuery } from "@/features/tools/api";
import { cn } from "@/lib/utils";

/**
 * Analysis-tool availability at a glance. Missing tools show their manual
 * install command with a copy button (one-click install lands in Phase B).
 */
export function ToolsCard() {
  const { t } = useTranslation();
  const { data: tools, isPending } = useToolsQuery();

  const missing = (tools ?? []).filter((tool) => !tool.available);
  const available = (tools ?? []).filter((tool) => tool.available);

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t("home.tools.title")}</h2>
        {tools ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("home.tools.count", {
              available: available.length,
              total: tools.length,
            })}
          </span>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">
          {t("common.states.loading")}
        </p>
      ) : null}

      {missing.length > 0 ? (
        <>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            {t("home.tools.warning")}
          </p>
          <ul className="space-y-2">
            {missing.map((tool) => (
              <li
                key={tool.id}
                className="rounded-md border border-border p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tool.name}</span>
                  <Badge
                    variant="outline"
                    className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25"
                  >
                    {t("home.tools.missing")}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tool.purpose}
                </p>
                <InstallHint command={tool.install} />
                <div className="mt-1.5">
                  <InstallToolButton tool={tool} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!isPending && missing.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("home.tools.all_installed")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {available.map((tool) => (
          <span
            key={tool.id}
            className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"
          >
            {tool.name}
          </span>
        ))}
      </div>

      <Link
        to="/tools"
        className="text-xs font-medium text-primary hover:underline"
      >
        {t("home.tools.view_all")}
      </Link>
    </Card>
  );
}

function InstallHint({ command }: { command: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
        {command}
      </code>
      <button
        type="button"
        aria-label={t("home.tools.copy")}
        title={t("home.tools.copy")}
        onClick={() => {
          navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={cn(
          "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          copied && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}
