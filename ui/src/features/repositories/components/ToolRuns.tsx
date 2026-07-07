import { CheckIcon, MinusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ToolRun } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ToolRuns({ toolRuns }: { toolRuns: ToolRun[] }) {
  const { t } = useTranslation();

  if (toolRuns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("repositories.view.tools_none")}
      </p>
    );
  }

  const contributed = toolRuns.filter((tr) => tr.contributed).length;

  return (
    <details className="group text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground hover:text-foreground">
        <span className="transition-transform group-open:rotate-90">›</span>
        {t("repositories.view.tools_summary", {
          contributed,
          total: toolRuns.length,
        })}
      </summary>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {toolRuns.map((tr) => {
          const ok = tr.contributed;
          return (
            <li
              key={tr.name}
              className="flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-foreground/10"
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  ok
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {ok ? (
                  <CheckIcon className="size-3" />
                ) : (
                  <MinusIcon className="size-3" />
                )}
              </span>
              <span className="font-medium">{tr.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {ok
                  ? t("repositories.view.tool_contributed")
                  : tr.available
                    ? t("repositories.view.tool_available")
                    : t("repositories.view.tool_unavailable")}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
