import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** MR comment severities (info/minor/major/critical) — a different vocabulary
 * from the repo vulnerabilities' SeverityBadge (critical/high/moderate/low). */
const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  major:
    "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  minor:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
};

export function ReviewSeverityBadge({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const style =
    SEVERITY_STYLES[severity] ??
    "bg-muted text-muted-foreground border-foreground/10";
  return (
    <Badge variant="outline" className={cn("uppercase", style, className)}>
      {t(`merge_reviews.reviews.severity_${severity}`)}
    </Badge>
  );
}
