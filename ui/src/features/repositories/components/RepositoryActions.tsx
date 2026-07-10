import { useNavigate } from "@tanstack/react-router";
import { Loader2Icon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRefreshRepositoryMutation } from "../api";
import { DeleteRepositoryDialog } from "./DeleteRepositoryDialog";

/**
 * Repository header actions: pull-latest (fetch + re-analyze, blocking) and delete (removes the
 * repo and everything derived from it). A blocking refresh can succeed with `status: "failed"`,
 * surfaced as an explicit error toast on the success path.
 */
export function RepositoryActions({ id, slug }: { id: string; slug: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    <div className="flex items-center gap-2">
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
      <DeleteRepositoryDialog
        id={id}
        slug={slug}
        onDeleted={() => navigate({ to: "/", search: { page: 1, size: 20 } })}
        trigger={
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
            {t("repositories.actions.delete_button")}
          </Button>
        }
      />
    </div>
  );
}
