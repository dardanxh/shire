import { StarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CreateMrRemarkInput, MrRemarkOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAddRemarkMutation, useDeleteRemarkMutation } from "../api";

/**
 * The star that keeps a finding as a human remark for this MR.
 *
 * Toggles: `remark` present means the finding is already kept, and clicking removes it.
 * Each button owns its own mutations — starring one finding never disables the others.
 */
export function RemarkStarButton({
  reviewId,
  remark,
  payload,
  className,
}: {
  reviewId: string;
  remark: MrRemarkOut | undefined;
  payload: CreateMrRemarkInput;
  className?: string;
}) {
  const { t } = useTranslation();
  const { mutate: addRemark, isPending: isAdding } =
    useAddRemarkMutation(reviewId);
  const { mutate: deleteRemark, isPending: isRemoving } =
    useDeleteRemarkMutation(reviewId);
  const starred = remark != null;

  return (
    <button
      type="button"
      disabled={isAdding || isRemoving}
      onClick={() => {
        if (remark) deleteRemark(remark.id);
        else addRemark(payload);
      }}
      aria-label={
        starred
          ? t("merge_reviews.remarks.unstar")
          : t("merge_reviews.remarks.star")
      }
      aria-pressed={starred}
      className={cn(
        "shrink-0 rounded-sm p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-50",
        starred && "text-[var(--warning)] hover:text-[var(--warning)]",
        className,
      )}
    >
      <StarIcon
        className={cn("size-3.5", starred && "fill-current")}
        aria-hidden
      />
    </button>
  );
}
