import { CheckIcon, Trash2Icon } from "lucide-react";
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
} from "@/components/ui/dialog";
import type { MemberSummaryOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useAddMergesMutation,
  useMergesQuery,
  useRemoveMergeMutation,
} from "../api";

/**
 * Merge the selected members into one identity: pick which of them is the primary
 * (its email keys the combined identity); the rest become aliases. Existing merge
 * rules are listed below so any alias can be split out again.
 */
export function MergeMembersDialog({
  open,
  onOpenChange,
  members,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The currently selected members (empty when opened just to manage rules). */
  members: MemberSummaryOut[];
  onMerged: () => void;
}) {
  const { t } = useTranslation();
  const { data: merges } = useMergesQuery();
  const { mutate: addMerges, isPending: isMerging } = useAddMergesMutation();
  const { mutate: removeMerge } = useRemoveMergeMutation();

  // Primary defaults to the most-committed selected member; a click overrides it.
  // Derived (not synced via effect) so a stale override never survives a new selection.
  const [primaryOverride, setPrimaryOverride] = useState<string | null>(null);
  const defaultPrimaryId =
    [...members].sort((a, b) => b.commits - a.commits)[0]?.id ?? null;
  const primaryId =
    primaryOverride && members.some((m) => m.id === primaryOverride)
      ? primaryOverride
      : defaultPrimaryId;
  const setPrimaryId = setPrimaryOverride;

  const primary = members.find((m) => m.id === primaryId);
  const aliases = members.filter((m) => m.id !== primaryId);

  const handleMerge = () => {
    if (!primary || aliases.length === 0) return;
    addMerges(
      {
        primary_email: primary.email,
        alias_emails: aliases.map((m) => m.email),
      },
      {
        onSuccess: () => {
          toast.success(
            t("members.merge.success", { count: aliases.length + 1 }),
          );
          onMerged();
          onOpenChange(false);
        },
      },
    );
  };

  const handleRemove = (id: string) => {
    removeMerge(id, {
      onSuccess: () => toast.success(t("members.merge.removed")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("members.merge.title")}</DialogTitle>
          <DialogDescription>
            {t("members.merge.description")}
          </DialogDescription>
        </DialogHeader>

        {members.length >= 2 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("members.merge.pick_primary")}
            </p>
            <div className="overflow-hidden rounded-md border border-border">
              {members.map((member) => {
                const isPrimary = member.id === primaryId;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setPrimaryId(member.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-t border-border px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-muted/50",
                      isPrimary && "bg-accent/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border",
                        isPrimary
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {isPrimary ? <CheckIcon className="size-3" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {member.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {t("members.merge.commit_count", {
                        count: member.commits,
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={handleMerge}
                disabled={isMerging || aliases.length === 0}
              >
                {t("members.merge.confirm", { count: members.length })}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("members.merge.existing")}
          </p>
          <div className="overflow-hidden rounded-md border border-border">
            {merges && merges.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {merges.map((merge) => (
                    <tr
                      key={merge.id}
                      className="border-t border-border first:border-t-0"
                    >
                      <td className="px-3 py-2">
                        <code className="font-mono text-xs">
                          {merge.alias_email}
                        </code>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <code className="font-mono text-xs">
                          {merge.primary_email}
                        </code>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("members.merge.remove")}
                          title={t("members.merge.remove")}
                          onClick={() => handleRemove(merge.id)}
                        >
                          <Trash2Icon className="size-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t("members.merge.empty")}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
