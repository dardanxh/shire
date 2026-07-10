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
import { useDeleteHobitMutation } from "../api";

/** Confirm + delete a custom hobit (and its runs, briefing items, assignments). */
export function DeleteHobitDialog({
  slug,
  name,
  trigger,
  onDeleted,
}: {
  slug: string;
  name: string;
  trigger: ReactElement;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate: deleteHobit, isPending } = useDeleteHobitMutation();

  const handleDelete = () => {
    deleteHobit(slug, {
      onSuccess: () => {
        toast.success(t("hobits.delete.toast_deleted", { name }));
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
          <DialogTitle>{t("hobits.delete.title")}</DialogTitle>
          <DialogDescription>
            {t("hobits.delete.body", { name })}
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
            {t("hobits.delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
