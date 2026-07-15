import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SIZE_STYLES: Record<string, string> = {
  small:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  large:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  huge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

export function SizeClassBadge({
  size,
  className,
}: {
  size: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!size) return null;
  const style =
    SIZE_STYLES[size] ?? "bg-muted text-muted-foreground border-foreground/10";
  return (
    <Badge variant="outline" className={cn(style, className)}>
      {t(`merge_reviews.size.${size}`)}
    </Badge>
  );
}
