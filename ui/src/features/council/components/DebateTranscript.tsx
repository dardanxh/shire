import { useTranslation } from "react-i18next";

import { CollapsibleBlock } from "@/components/shared/CollapsibleBlock";
import { Badge } from "@/components/ui/badge";
import type { CouncilTakeOut } from "@/lib/api";

/** The raw debate, grouped by round: every take a collapsible block. The devil's advocate
 * stands out; failed takes show their error instead of a narrative. */
export function DebateTranscript({
  takes,
  defaultOpen = false,
}: {
  takes: CouncilTakeOut[];
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const rounds = [1, 2].map(
    (round) => [round, takes.filter((take) => take.round === round)] as const,
  );

  return (
    <div className="space-y-6">
      {rounds.map(([round, roundTakes]) =>
        roundTakes.length > 0 ? (
          <div key={round} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t(`council.view.round_${round}`)}
            </h3>
            {roundTakes.map((take) => (
              <CollapsibleBlock
                key={take.id}
                title={
                  take.headline
                    ? `${take.hobit_name} — ${take.headline}`
                    : take.hobit_name
                }
                content={
                  take.narrative ??
                  (take.error
                    ? `${t("council.takes.failed")}: ${take.error}`
                    : null)
                }
                emptyLabel={t("council.takes.empty")}
                // Takes are written as Markdown (see the council prompts).
                body="markdown"
                defaultOpen={defaultOpen}
                variant={take.is_devils_advocate ? "destructive" : "default"}
                titleAccessory={
                  take.is_devils_advocate ? (
                    <Badge variant="destructive">
                      {t("council.takes.devils_advocate")}
                    </Badge>
                  ) : take.status !== "completed" ? (
                    <Badge variant="outline">
                      {t(`council.takes.status.${take.status}`)}
                    </Badge>
                  ) : null
                }
              />
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}
