import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime, formatTimeAgoShort } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A dense "Generated 3d ago" stamp for AI-generated content. The relative time keeps the
 * reader oriented at a glance; hovering reveals the exact datetime. When `commitsBehind` is
 * provided (repository artifacts, where the generation commit is tracked), it also flags how
 * far the content has drifted from the latest analyzed commit — the cue to refresh it.
 */
export function GeneratedBadge({
  generatedAt,
  commitsBehind,
  label,
  className,
}: {
  generatedAt: string | null | undefined;
  /** Commits between the generation commit and the latest analyzed HEAD. `0` = up to date;
   * `null`/omitted = not tracked for this content type (no drift indicator shown). */
  commitsBehind?: number | null;
  /** Override the leading verb (defaults to "Generated"). Pass "" for a bare "3d ago" with no
   * verb — useful in dense meta rows. */
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!generatedAt) return null;

  const prefix = label ?? t("common.generated.prefix");
  const relative = formatTimeAgoShort(generatedAt);
  const behind = commitsBehind ?? null;
  const behindDetail =
    behind == null
      ? null
      : behind <= 0
        ? t("common.generated.up_to_date")
        : t("common.generated.commits_behind", { count: behind });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex w-fit cursor-default items-center gap-1.5 text-xs text-muted-foreground",
              className,
            )}
          />
        }
      >
        <span className="underline decoration-dotted underline-offset-2">
          {prefix ? `${prefix} ${relative}` : relative}
        </span>
        {behind != null && behind > 0 ? (
          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
            {t("common.generated.commits_behind_short", { count: behind })}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span>
          {t("common.generated.exact", { when: formatDateTime(generatedAt) })}
        </span>
        {behindDetail ? (
          <span className="text-background/70">{behindDetail}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
