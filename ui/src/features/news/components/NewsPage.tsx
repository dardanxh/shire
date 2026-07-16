import { CheckCheckIcon, Loader2Icon, RssIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  hasPendingPoll,
  useFetchNowMutation,
  useMarkAllReadMutation,
  useNewsPollsQuery,
} from "../api";
import { NewsConfigPanel } from "./NewsConfigPanel";
import { NewsFeed } from "./NewsFeed";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { TopicsPanel } from "./TopicsPanel";

export type NewsTab = "feed" | "topics";

export function NewsPage({
  tab,
  page,
  size,
  topic,
  unread,
  onTabChange,
  onPageChange,
  onSizeChange,
  onTopicChange,
  onUnreadChange,
}: {
  tab: NewsTab;
  page: number;
  size: number;
  topic?: string;
  unread: boolean;
  onTabChange: (tab: NewsTab) => void;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  onTopicChange: (topic: string | undefined) => void;
  onUnreadChange: (unread: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: polls } = useNewsPollsQuery();
  const { mutate: fetchNow, isPending: isEnqueuing } = useFetchNowMutation();
  const { mutate: markAllRead } = useMarkAllReadMutation();

  const isFetching = isEnqueuing || hasPendingPoll(polls ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => markAllRead(undefined)}>
            <CheckCheckIcon className="size-4" />
            {t("news.actions.mark_all_read")}
          </Button>
          <Button onClick={() => fetchNow(undefined)} disabled={isFetching}>
            {isFetching ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RssIcon className="size-4" />
            )}
            {isFetching
              ? t("news.actions.fetching")
              : t("news.actions.fetch_now")}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(next) => onTabChange(next as NewsTab)}>
        <TabsList>
          <TabsTrigger value="feed">{t("news.tabs.feed")}</TabsTrigger>
          <TabsTrigger value="topics">{t("news.tabs.topics")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "feed" ? (
        <NewsFeed
          page={page}
          size={size}
          topic={topic}
          unread={unread}
          onPageChange={onPageChange}
          onSizeChange={onSizeChange}
          onTopicChange={onTopicChange}
          onUnreadChange={onUnreadChange}
        />
      ) : (
        <div className="space-y-6">
          <TopicsPanel />
          <RecommendationsPanel />
          <NewsConfigPanel />
        </div>
      )}
    </div>
  );
}
