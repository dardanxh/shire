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
import { type AiAction, useDeleteAiActionMutation } from "../api";

export function DeleteAiActionDialog({
  action,
  open,
  onOpenChange,
  onDeleted,
}: {
  action: Pick<AiAction, "id" | "title">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: deleteAction, isPending } = useDeleteAiActionMutation();

  const handleConfirm = () => {
    deleteAction(action.id, {
      onSuccess: () => {
        toast.success(t("ai_actions.toast.deleted", { title: action.title }));
        onOpenChange(false);
        onDeleted?.();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ai_actions.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("ai_actions.delete.description", { title: action.title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("common.actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={handleConfirm}
          >
            {t("common.actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
