import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CouncilTakeOut, CouncilTopicDetailOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DebateTranscript } from "./DebateTranscript";

function MemberChip({ take }: { take: CouncilTakeOut }) {
  const running = take.status === "pending" || take.status === "running";
  const failed = !running && take.status !== "completed";
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        take.is_devils_advocate && "border-destructive/50 text-destructive",
        failed && !take.is_devils_advocate && "text-muted-foreground",
      )}
    >
      {running ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : failed ? (
        <XIcon className="size-3 text-destructive" />
      ) : (
        <CheckIcon className="size-3 text-primary" />
      )}
      {take.hobit_name}
    </span>
  );
}

/** Live view of a running debate: per-round member chips, completed rounds expandable,
 * and the chair's row while the synthesis job runs. */
export function DebateProgress({ topic }: { topic: CouncilTopicDetailOut }) {
  const { t } = useTranslation();
  const rounds = [1, 2].map(
    (round) =>
      [round, topic.takes.filter((take) => take.round === round)] as const,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("council.view.debate_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rounds.map(([round, takes]) =>
            takes.length > 0 ? (
              <div key={round} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`council.view.round_${round}`)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {takes.map((take) => (
                    <MemberChip key={take.id} take={take} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
          {topic.status === "synthesizing" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t("council.view.chair_working")}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <DebateTranscript
        takes={topic.takes.filter(
          (take) => take.status !== "pending" && take.status !== "running",
        )}
      />
    </div>
  );
}
