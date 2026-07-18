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
import { useDeleteCouncilTopicMutation } from "../api";

/** Confirm + delete a council topic (its takes cascade). */
export function DeleteCouncilDialog({
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
  const { mutate: deleteTopic, isPending } = useDeleteCouncilTopicMutation();

  const handleDelete = () => {
    deleteTopic(id, {
      onSuccess: () => {
        toast.success(t("council.delete.toast_deleted", { name }));
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
          <DialogTitle>{t("council.delete.title")}</DialogTitle>
          <DialogDescription>
            {t("council.delete.body", { name })}
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
            {t("council.delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
