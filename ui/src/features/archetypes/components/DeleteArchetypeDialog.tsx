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
import { type Archetype, useDeleteArchetypeMutation } from "../api";

interface DeleteArchetypeDialogProps {
  archetype: Pick<Archetype, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete (e.g. edit page → back to list). */
  onDeleted?: () => void;
}

export function DeleteArchetypeDialog({
  archetype,
  open,
  onOpenChange,
  onDeleted,
}: DeleteArchetypeDialogProps) {
  const { t } = useTranslation();
  const { mutate: deleteArchetype, isPending } = useDeleteArchetypeMutation();

  const handleConfirm = () => {
    deleteArchetype(archetype.id, {
      onSuccess: () => {
        toast.success(t("archetypes.delete.toast_success"));
        onOpenChange(false);
        onDeleted?.();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archetypes.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("archetypes.delete.description", { name: archetype.name })}
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
            {t("archetypes.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
