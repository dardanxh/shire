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
import { useDeleteConnectionMutation } from "../api";

/** Confirm + delete a connection. `trigger` is the element that opens the dialog. */
export function DeleteConnectionDialog({
  id,
  name,
  trigger,
  onDeleted,
}: {
  id: string;
  name: string;
  trigger: ReactElement;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate: deleteConnection, isPending } = useDeleteConnectionMutation();

  const handleDelete = () => {
    deleteConnection(id, {
      onSuccess: () => {
        toast.success(t("connectors.delete.toast_deleted", { name }));
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
          <DialogTitle>{t("connectors.delete.title")}</DialogTitle>
          <DialogDescription>
            {t("connectors.delete.body", { name })}
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
            {t("connectors.delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
