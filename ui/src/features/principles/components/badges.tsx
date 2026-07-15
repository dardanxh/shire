import { Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25",
  warning:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        SEVERITY_STYLES[severity] ??
          "bg-muted text-muted-foreground border-foreground/10",
      )}
    >
      {t(`principles.severity.${severity}`, { defaultValue: severity })}
    </Badge>
  );
}

const VERDICT_STYLES: Record<string, string> = {
  upheld:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  violated: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  pending:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  error: "bg-muted text-muted-foreground border-foreground/10",
};

/** The audit outcome; `status` may also be "never" (no check yet). */
export function VerdictBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(
        VERDICT_STYLES[status] ??
          "bg-muted text-muted-foreground border-foreground/10",
        className,
      )}
    >
      {status === "pending" ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : null}
      {t(`principles.verdict.${status}`, { defaultValue: status })}
    </Badge>
  );
}
