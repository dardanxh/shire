import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type AiAction, isInFlight, useRunAllAiActionsMutation } from "../api";

/** Confirms before refreshing every report: each run spends a Claude session. */
export function RunAllAiActionsDialog({
  actions,
  open,
  onOpenChange,
}: {
  actions: Pick<AiAction, "status">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { mutate: runAll, isPending } = useRunAllAiActionsMutation();
  const busy = actions.filter(isInFlight).length;
  const toRun = actions.length - busy;

  const handleConfirm = () => {
    runAll(undefined, {
      onSuccess: (result) => {
        toast.success(t("ai_actions.toast.run_all", { count: result.queued }));
        onOpenChange(false);
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ai_actions.run_all.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("ai_actions.run_all.description", { count: toRun })}
            {busy > 0
              ? ` ${t("ai_actions.run_all.busy", { count: busy })}`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("common.actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || toRun === 0}
            onClick={handleConfirm}
          >
            {t("ai_actions.run_all.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
