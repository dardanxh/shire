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
import {
  type ModellingStrategy,
  useDeleteModellingStrategyMutation,
} from "../api";

interface DeleteModellingStrategyDialogProps {
  strategy: Pick<ModellingStrategy, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete (e.g. view page → back to list). */
  onDeleted?: () => void;
}

export function DeleteModellingStrategyDialog({
  strategy,
  open,
  onOpenChange,
  onDeleted,
}: DeleteModellingStrategyDialogProps) {
  const { t } = useTranslation();
  const { mutate: deleteStrategy, isPending } =
    useDeleteModellingStrategyMutation();

  const handleConfirm = () => {
    deleteStrategy(strategy.id, {
      onSuccess: () => {
        toast.success(t("modelling.delete.toast_success"));
        onOpenChange(false);
        onDeleted?.();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("modelling.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("modelling.delete.description", { name: strategy.name })}
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
            {t("modelling.delete.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
