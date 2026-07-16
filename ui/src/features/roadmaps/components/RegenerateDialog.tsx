import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRegenerateRoadmapMutation } from "../api";

/** Confirm a re-plan: creates version N+1; done and in-review items carry over. */
export function RegenerateDialog({
  roadmapId,
  open,
  onOpenChange,
}: {
  roadmapId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { mutate: regenerate, isPending } =
    useRegenerateRoadmapMutation(roadmapId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("roadmaps.regenerate.title")}</DialogTitle>
          <DialogDescription>{t("roadmaps.regenerate.body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("common.actions.cancel")}
          </Button>
          <Button
            onClick={() =>
              regenerate(undefined, { onSuccess: () => onOpenChange(false) })
            }
            disabled={isPending}
          >
            {t("roadmaps.regenerate.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
