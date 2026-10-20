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
import { type Bookmark, useDeleteBookmarkMutation } from "../api";

export function DeleteBookmarkDialog({
  bookmark,
  open,
  onOpenChange,
  onDeleted,
}: {
  bookmark: Pick<Bookmark, "id" | "name" | "action">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: deleteBookmark, isPending } = useDeleteBookmarkMutation();

  const handleConfirm = () => {
    deleteBookmark(bookmark.id, {
      onSuccess: () => {
        toast.success(t("launchpad.delete.toast", { name: bookmark.name }));
        onOpenChange(false);
        onDeleted?.();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("launchpad.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              bookmark.action
                ? "launchpad.delete.description_with_action"
                : "launchpad.delete.description",
              { name: bookmark.name },
            )}
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
