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
import { type Technology, useDeleteTechnologyMutation } from "../api";

interface DeleteTechnologyDialogProps {
  technology: Pick<Technology, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete (e.g. view page → back to list). */
  onDeleted?: () => void;
}

export function DeleteTechnologyDialog({
  technology,
  open,
  onOpenChange,
  onDeleted,
}: DeleteTechnologyDialogProps) {
  const { t } = useTranslation();
  const { mutate: deleteTechnology, isPending } = useDeleteTechnologyMutation();

  const handleConfirm = () => {
    deleteTechnology(technology.id, {
      onSuccess: () => {
        toast.success(t("technologies.delete.toast_success"));
        onOpenChange(false);
        onDeleted?.();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("technologies.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("technologies.delete.description", { name: technology.name })}
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
            {t("technologies.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
