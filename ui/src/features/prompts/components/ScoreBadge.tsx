import { Badge } from "@/components/ui/badge";

/**
 * Maps a 0-100 static score onto the theme's semantic colours.
 *
 * The thresholds are deliberately generous at the top: the rule pack only deducts for a named
 * defect, so 90+ means "nothing the checks know about is wrong", not "perfect".
 */
export function scoreVariant(
  score: number,
): "success" | "warning" | "destructive" {
  if (score >= 85) return "success";
  if (score >= 60) return "warning";
  return "destructive";
}

export function ScoreBadge({
  score,
  label,
}: {
  score: number | null | undefined;
  label?: string;
}) {
  if (score === null || score === undefined) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <Badge variant={scoreVariant(score)}>
      {label ? `${label} ` : ""}
      {score}
    </Badge>
  );
}
