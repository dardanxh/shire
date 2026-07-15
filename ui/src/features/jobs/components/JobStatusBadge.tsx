import { Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  succeeded:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
};

export function JobStatusBadge({
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
    <Badge variant="outline" className={cn("capitalize", style, className)}>
      {status === "running" ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : null}
      {t(`jobs.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
