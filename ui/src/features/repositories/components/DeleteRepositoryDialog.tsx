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
import { useDeleteRepositoryMutation } from "../api";

/** Confirm + delete a repository (and everything derived from it). `trigger` opens the dialog;
 * `onDeleted` fires after a successful delete (e.g. to navigate away). */
export function DeleteRepositoryDialog({
  id,
  slug,
  trigger,
  onDeleted,
}: {
  id: string;
  slug: string;
  trigger: ReactElement;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate: deleteRepository, isPending } = useDeleteRepositoryMutation();

  const handleDelete = () => {
    deleteRepository(id, {
      onSuccess: () => {
        toast.success(t("repositories.delete.toast_deleted", { slug }));
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
          <DialogTitle>{t("repositories.delete.title")}</DialogTitle>
          <DialogDescription>
            {t("repositories.delete.body", { slug })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t("repositories.delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
