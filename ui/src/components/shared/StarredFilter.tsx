import { StarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Toolbar toggle for the catalog "starred only" filter (URL-backed). Shares the
 * card star's visual language: warning tint + filled icon while active. The
 * button itself shows and clears the state, so it stays out of the chips row.
 */
export function StarredFilterButton({
  active,
  label,
  onToggle,
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="outline"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "bg-background",
        active && "border-warning/40 text-warning hover:text-warning",
      )}
    >
      <StarIcon className={cn(active && "fill-warning")} />
      {label}
    </Button>
  );
}
