import { ServerOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { useAiActionsRunnerQuery } from "../api";

/**
 * Shown only while the host runner is offline: runs need the operator's own `claude` CLI
 * (their claude.ai connectors and skills), so without it they just wait in the queue.
 */
export function RunnerBanner() {
  const { t } = useTranslation();
  const { data: runner } = useAiActionsRunnerQuery();
  if (!runner || runner.connected) return null;
  return (
    <Card className="flex-row items-start gap-3 border-warning/30 bg-warning/5 p-4 text-sm">
      <ServerOffIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="font-medium text-warning">
          {t("ai_actions.runner.offline_title")}
        </p>
        <p className="text-muted-foreground">
          {runner.queued > 0
            ? t("ai_actions.runner.offline_queued", { count: runner.queued })
            : t("ai_actions.runner.offline_body")}
        </p>
        <code className="block w-fit rounded bg-muted px-2 py-1 text-xs">
          scripts/host-runner.sh --install-agent
        </code>
      </div>
    </Card>
  );
}
