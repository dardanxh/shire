import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const GAP_STYLES: Record<string, string> = {
  "up-to-date":
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  patch: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25",
  minor:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  major: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
};

/** Colored badge for a dependency's upgrade gap. Renders nothing for "unknown". */
export function UpgradeGapBadge({ gap }: { gap: string }) {
  const { t } = useTranslation();
  const style = GAP_STYLES[gap];
  if (!style) return null;
  return (
    <Badge variant="outline" className={cn("text-[10px]", style)}>
      {t(`repositories.view.gap_${gap.replace(/-/g, "_")}`)}
    </Badge>
  );
}
