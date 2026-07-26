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
import { type Blueprint, useDeleteBlueprintMutation } from "../api";

interface DeleteBlueprintDialogProps {
  blueprint: Pick<Blueprint, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete (e.g. view page → back to list). */
  onDeleted?: () => void;
}

/** The adopted-blueprint 409 surfaces via the global mutation-error toast. */
export function DeleteBlueprintDialog({
  blueprint,
  open,
  onOpenChange,
  onDeleted,
}: DeleteBlueprintDialogProps) {
  const { t } = useTranslation();
  const { mutate: deleteBlueprint, isPending } = useDeleteBlueprintMutation();

  const handleConfirm = () => {
    deleteBlueprint(blueprint.id, {
      onSuccess: () => {
        toast.success(t("blueprints.delete.toast_success"));
        onOpenChange(false);
        onDeleted?.();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("blueprints.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("blueprints.delete.description", { name: blueprint.name })}
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
            {t("blueprints.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
