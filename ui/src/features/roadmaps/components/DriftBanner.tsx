import { RadarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useAcceptDriftFindingMutation,
  useDismissDriftFindingMutation,
  useDriftStatusQuery,
} from "../api";
import { ItemStatusBadge } from "./chips";

/**
 * Inbox-style drift proposals above the tabs: one row per open finding with the
 * proposed status change, the agent's evidence, and Accept / Dismiss (the news
 * RecommendationsPanel shape). Renders nothing when there is nothing to decide.
 */
export function DriftBanner({
  roadmapId,
  readOnly,
}: {
  roadmapId: string;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useDriftStatusQuery(roadmapId);
  const { mutate: acceptFinding, isPending: isAccepting } =
    useAcceptDriftFindingMutation(roadmapId);
  const { mutate: dismissFinding, isPending: isDismissing } =
    useDismissDriftFindingMutation(roadmapId);

  const findings = data?.findings ?? [];
  const checking = (data?.checks ?? []).some((c) => c.status === "pending");

  if (findings.length === 0 && !checking) return null;

  return (
    <Card className="gap-3 border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <RadarIcon className="size-4 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-semibold">
          {checking && findings.length === 0
            ? t("roadmaps.drift.checking")
            : t("roadmaps.drift.title", { count: findings.length })}
        </p>
      </div>
      {findings.map((finding) => (
        <div
          key={finding.id}
          className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {finding.item_title}
              <ItemStatusBadge status={finding.item_status} />
              <span className="text-muted-foreground">→</span>
              <ItemStatusBadge status="done" />
            </p>
            {finding.evidence ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {finding.evidence}
              </p>
            ) : null}
          </div>
          {readOnly ? null : (
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={isAccepting || isDismissing}
                onClick={() => acceptFinding(finding.id)}
              >
                {t("roadmaps.drift.accept")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isAccepting || isDismissing}
                onClick={() => dismissFinding(finding.id)}
              >
                {t("roadmaps.drift.dismiss")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
