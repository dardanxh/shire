import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRefreshRepositoryMutation } from "../api";

/**
 * Repository-level action bar: pull latest + re-analyze. Per-tool runs live in
 * the Integrations tab now. A blocking refresh can succeed with
 * `status: "failed"`, surfaced as an explicit error toast on the success path.
 */
export function RepositoryActions({ id }: { id: string }) {
  const { t } = useTranslation();
  const { mutate: refresh, isPending: refreshing } =
    useRefreshRepositoryMutation(id);

  const handleRefresh = () => {
    refresh(undefined, {
      onSuccess: (repo) => {
        if (repo.status === "failed") {
          toast.error(
            t("repositories.actions.refresh_failed", { slug: repo.slug }),
            { description: repo.error ?? undefined },
          );
        } else {
          toast.success(t("repositories.actions.refreshed"));
        }
      },
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
      <div>
        <p className="text-sm font-medium">
          {t("repositories.actions.pull_title")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("repositories.actions.pull_desc")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={refreshing}
        onClick={handleRefresh}
      >
        {refreshing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
        {refreshing
          ? t("repositories.actions.pulling")
          : t("repositories.actions.pull_button")}
      </Button>
    </div>
  );
}
