import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const VERDICT_STYLES: Record<string, string> = {
  looks_safe:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  needs_attention:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  high_risk: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!verdict) return null;
  const style =
    VERDICT_STYLES[verdict] ??
    "bg-muted text-muted-foreground border-foreground/10";
  return (
    <Badge variant="outline" className={cn(style, className)}>
      {t(`merge_reviews.verdict.${verdict}`)}
    </Badge>
  );
}
