import { Loader2Icon } from "lucide-react";
import type { ReactElement } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDeleteMergeReviewMutation } from "../api";

/** Confirm + delete an MR review. `trigger` opens the dialog; `onDeleted` fires
 * after a successful delete (e.g. to navigate back to the list). */
export function DeleteMergeReviewDialog({
  id,
  trigger,
  onDeleted,
}: {
  id: string;
  trigger: ReactElement;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate: deleteReview, isPending } = useDeleteMergeReviewMutation();

  const handleDelete = () => {
    deleteReview(id, {
      onSuccess: () => {
        toast.success(t("merge_reviews.delete.toast_deleted"));
        setOpen(false);
        onDeleted?.();
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isPending) return;
        setOpen(o);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("merge_reviews.delete.title")}</DialogTitle>
          <DialogDescription>
            {t("merge_reviews.delete.body")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            {t("merge_reviews.delete.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t("merge_reviews.delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
