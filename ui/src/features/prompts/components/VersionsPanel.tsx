import { HistoryIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CollapsibleBlock } from "@/components/shared/CollapsibleBlock";
import { Sparkline } from "@/components/shared/Sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PromptVersionOut } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useSetCurrentVersionMutation } from "../api";
import { ScoreBadge } from "./ScoreBadge";

/**
 * Version history: what each save changed and what it did to the score.
 *
 * Versions are immutable, so "restore" moves the prompt's pointer rather than copying text
 * forward — the later versions stay on the record even when you decide one of them was a mistake.
 */
export function VersionsPanel({
  promptId,
  versions,
  currentVersionId,
}: {
  promptId: string;
  versions: PromptVersionOut[];
  currentVersionId: string | null;
}) {
  const { t } = useTranslation();
  const { mutate: setCurrent, isPending } =
    useSetCurrentVersionMutation(promptId);

  if (versions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <HistoryIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("prompts.versions.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  // Oldest first for the trend, so the sparkline reads left-to-right in time.
  const trend = [...versions].reverse().map((version) => version.static_score);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {t("prompts.versions.trend")}
            </span>
            <Sparkline
              values={trend}
              title={t("prompts.versions.trend_title")}
            />
          </div>
          <p className="max-w-md text-xs text-muted-foreground">
            {t("prompts.versions.trend_hint")}
          </p>
        </CardContent>
      </Card>

      {versions.map((version) => {
        const isCurrent = version.id === currentVersionId;
        return (
          <Card key={version.id}>
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {t("prompts.versions.number", { number: version.number })}
                </span>
                {isCurrent ? (
                  <Badge variant="default">
                    {t("prompts.versions.current")}
                  </Badge>
                ) : null}
                <ScoreBadge score={version.static_score} />
                <Badge variant="outline">
                  {t("prompts.versions.tokens", {
                    formatted: formatNumber(version.estimated_input_tokens),
                  })}
                </Badge>
                <Badge variant="ghost">
                  {t(`prompts.versions.source.${version.source}`)}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(version.created_at)}
                </span>
              </div>

              {version.note ? <p className="text-sm">{version.note}</p> : null}

              <CollapsibleBlock
                title={t("prompts.versions.body")}
                content={version.body}
                defaultOpen={false}
              />

              {!isCurrent ? (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      setCurrent(version.id, {
                        onSuccess: () =>
                          toast.success(
                            t("prompts.versions.restored", {
                              number: version.number,
                            }),
                          ),
                      })
                    }
                  >
                    {isPending ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <RotateCcwIcon />
                    )}
                    {t("prompts.versions.restore")}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
