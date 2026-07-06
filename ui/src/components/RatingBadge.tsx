import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/api";

const RATING_STYLES: Record<Rating, string> = {
  A: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30",
  B: "bg-lime-500/15 text-lime-700 dark:text-lime-400 ring-lime-500/30",
  C: "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/30",
  D: "bg-orange-500/15 text-orange-700 dark:text-orange-400 ring-orange-500/30",
  E: "bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/30",
  NA: "bg-muted text-muted-foreground ring-foreground/10",
};

export function RatingBadge({
  label,
  rating,
  className,
}: {
  label: string;
  rating: Rating;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3 ring-1",
        RATING_STYLES[rating],
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background/60 text-xl font-bold tabular-nums">
        {rating === "NA" ? "—" : rating}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
