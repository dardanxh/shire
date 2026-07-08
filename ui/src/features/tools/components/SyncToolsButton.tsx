import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/lib/format";
import { useSyncToolsMutation, useToolsQuery } from "../api";

/**
 * Re-probe the local environment and refresh the persisted tools catalog. Shared between the Tools
 * page and the per-repo Integrations catalog — both read the same cached catalog. Shows when the
 * catalog was last synced.
 */
export function SyncToolsButton() {
  const { t } = useTranslation();
  const { data: tools } = useToolsQuery();
  const { mutate: sync, isPending } = useSyncToolsMutation();

  const syncedAt = tools?.[0]?.synced_at ?? null;

  const handleSync = () => {
    sync(undefined, {
      onSuccess: () => toast.success(t("tools.list.synced")),
    });
  };

  return (
    <div className="flex items-center gap-3">
      {syncedAt ? (
        <span className="text-xs text-muted-foreground">
          {t("tools.list.last_synced", { when: formatTimeAgo(syncedAt) })}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleSync}
      >
        {isPending ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
        {isPending ? t("tools.list.syncing") : t("tools.list.sync")}
      </Button>
    </div>
  );
}
