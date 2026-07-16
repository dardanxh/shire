import { Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Label chip colors — one hue family per kind of work. */
const LABEL_STYLES: Record<string, string> = {
  improvement: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25",
  fix: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  refactor:
    "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25",
  feature:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  security:
    "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/25",
  deprecation:
    "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/25",
  lib_upgrade:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  docs: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/25",
  testing: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/25",
  performance:
    "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/25",
};

const STATUS_STYLES: Record<string, string> = {
  proposed:
    "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/25",
  todo: "bg-muted text-muted-foreground border-foreground/10",
  in_progress:
    "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  in_review:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  dropped:
    "bg-muted text-muted-foreground/60 border-foreground/10 line-through",
};

export function LabelBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const style =
    LABEL_STYLES[label] ??
    "bg-muted text-muted-foreground border-foreground/10";
  return (
    <Badge variant="outline" className={cn(style, className)}>
      {t(`roadmaps.label.${label}`, { defaultValue: label })}
    </Badge>
  );
}

export function ItemStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const style =
    STATUS_STYLES[status] ??
    "bg-muted text-muted-foreground border-foreground/10";
  return (
    <Badge variant="outline" className={cn(style, className)}>
      {status === "in_progress" ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : null}
      {t(`roadmaps.item_status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function EffortBadge({
  effort,
  className,
}: {
  effort: string | null | undefined;
  className?: string;
}) {
  if (!effort) return null;
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-muted-foreground", className)}
    >
      {effort}
    </Badge>
  );
}
