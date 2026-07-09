import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type BriefingItemOut, extractErrorMessage } from "@/lib/api";
import { useBriefingQuery, useMarkPostReadMutation } from "../api";
import { BriefingFeed } from "./BriefingFeed";
import { BriefingPostDialog } from "./BriefingPostDialog";

export function BriefingPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useBriefingQuery();
  const { mutate: markRead } = useMarkPostReadMutation();
  const [selected, setSelected] = useState<BriefingItemOut | null>(null);

  const openPost = (post: BriefingItemOut) => {
    setSelected(post);
    if (!post.read_at) markRead(post.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("briefing.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("briefing.subtitle")}
        </p>
      </div>

      {isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-6 text-sm text-destructive">
          {t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
        </Card>
      ) : (data?.length ?? 0) === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          {t("briefing.empty")}
        </Card>
      ) : (
        <BriefingFeed items={data ?? []} onSelect={openPost} />
      )}

      <BriefingPostDialog post={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
