import { GitBranchIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchNamesQuery, useSwitchBranchMutation } from "../api";

/**
 * The header branch selector: all repository data reflects the selected (active) branch.
 * Picking a branch opens a confirm dialog — switching checks the branch out, clears generated
 * artifacts, and re-runs the full analysis (blocking, minutes). The Select's value is
 * server-derived, so cancelling simply closes the dialog and the selector snaps back.
 */
export function BranchSwitcher({
  id,
  slug,
  currentBranch,
  status,
}: {
  id: string;
  slug: string;
  currentBranch: string;
  status: string;
}) {
  const { t } = useTranslation();
  const { data: names } = useBranchNamesQuery(id);
  const { mutate: switchBranch, isPending } = useSwitchBranchMutation(id);
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);

  const busy = isPending || status === "cloning" || status === "analyzing";
  const branches = names?.branches.includes(currentBranch)
    ? names.branches
    : [currentBranch, ...(names?.branches ?? [])];

  const handleConfirm = () => {
    const branch = pendingBranch;
    if (!branch) return;
    switchBranch(branch, {
      onSuccess: (repo) => {
        setPendingBranch(null);
        if (repo.status === "failed") {
          toast.error(t("repositories.branch.switch_failed", { branch }), {
            description: repo.error ?? undefined,
          });
        } else {
          toast.success(t("repositories.branch.switched", { branch }));
        }
      },
      onError: () => setPendingBranch(null),
    });
  };

  return (
    <>
      <Select<string>
        value={currentBranch}
        onValueChange={(next) => {
          if (next && next !== currentBranch) setPendingBranch(next);
        }}
        disabled={busy}
      >
        <SelectTrigger
          className="h-7 w-auto gap-1.5 px-2 font-mono text-xs"
          aria-label={t("repositories.branch.label")}
        >
          {isPending ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <GitBranchIcon className="size-3.5 text-muted-foreground" />
          )}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem
              key={branch}
              value={branch}
              className="font-mono text-xs"
            >
              {branch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog
        open={pendingBranch !== null}
        onOpenChange={(open) => {
          if (isPending) return;
          if (!open) setPendingBranch(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("repositories.branch.confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("repositories.branch.confirm_body", {
                slug,
                branch: pendingBranch ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingBranch(null)}
              disabled={isPending}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button onClick={handleConfirm} disabled={isPending}>
              {isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {isPending
                ? t("repositories.branch.switching")
                : t("repositories.branch.confirm_button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
