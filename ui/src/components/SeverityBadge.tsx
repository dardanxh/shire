import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, string> = {
  critical:
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  high:
    "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  moderate:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low:
    "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  const key = severity.toLowerCase();
  const style = SEVERITY_STYLES[key] ?? "bg-muted text-muted-foreground border-foreground/10";
  return (
    <Badge variant="outline" className={cn("uppercase", style, className)}>
      {severity}
    </Badge>
  );
}
