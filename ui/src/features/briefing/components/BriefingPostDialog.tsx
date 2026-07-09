import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { BriefingItemOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useRunDetailQuery } from "../api";
import { hobitName } from "./BriefingFeed";

/** Expands a briefing post into the full hobit run behind it (narrative + scores). */
export function BriefingPostDialog({
  post,
  onClose,
}: {
  post: BriefingItemOut | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useRunDetailQuery(
    post?.repository_id ?? "",
    post?.hobit_run_id ?? "",
  );

  return (
    <Dialog open={post !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{post?.headline ?? ""}</DialogTitle>
          <DialogDescription>
            {post
              ? `${hobitName(post.hobit_slug)} · ${post.repository_slug} · ${formatDateTime(post.created_at)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {post ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{post.tier}</Badge>
            <Badge variant="secondary">
              {t("briefing.scores", {
                importance: post.importance,
                confidence: post.confidence,
                urgency: post.urgency,
              })}
            </Badge>
          </div>
        ) : null}

        {isPending || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : data.narrative ? (
          <Textarea
            value={data.narrative}
            readOnly
            spellCheck={false}
            className="min-h-[24rem] font-mono text-xs leading-relaxed"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.error ?? t("briefing.no_detail")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
