import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RepositoryStatus } from "@/lib/api";

const STATUS_STYLES: Record<RepositoryStatus, string> = {
  ready:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  failed:
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  registered:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  cloning:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  analyzing:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
};

export function StatusBadge({
  status,
  className,
}: {
  status: RepositoryStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", STATUS_STYLES[status], className)}
    >
      {status}
    </Badge>
  );
}
