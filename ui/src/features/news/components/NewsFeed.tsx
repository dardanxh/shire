import { ExternalLinkIcon, NewspaperIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage, type NewsItemOut } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useMarkItemReadMutation,
  useNewsItemsQuery,
  useNewsTopicsQuery,
} from "../api";

/** Sentinel for the topic filter's "all topics" option (Select can't carry undefined). */
const ALL_TOPICS = "__all__";

export function NewsFeed({
  page,
  size,
  topic,
  unread,
  onPageChange,
  onSizeChange,
  onTopicChange,
  onUnreadChange,
}: {
  page: number;
  size: number;
  topic?: string;
  unread: boolean;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  onTopicChange: (topic: string | undefined) => void;
  onUnreadChange: (unread: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useNewsItemsQuery({
    page,
    page_size: size,
    topic_id: topic,
    unread_only: unread || undefined,
  });
  const { data: topics } = useNewsTopicsQuery();
  const { mutate: markRead } = useMarkItemReadMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const openItem = (item: NewsItemOut) => {
    if (!item.read_at) markRead(item.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={topic ?? ALL_TOPICS}
          onValueChange={(next) =>
            onTopicChange(!next || next === ALL_TOPICS ? undefined : next)
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue>
              {(value) =>
                value === ALL_TOPICS
                  ? t("news.feed.all_topics")
                  : ((topics ?? []).find((tp) => tp.id === value)?.name ??
                    String(value))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TOPICS}>
              {t("news.feed.all_topics")}
            </SelectItem>
            {(topics ?? []).map((tp) => (
              <SelectItem key={tp.id} value={tp.id}>
                {tp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => onUnreadChange(!unread)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            unread
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {t("news.feed.unread_only")}
        </button>
      </div>

      {isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-6 text-sm text-destructive">
          {t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
        </Card>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <NewspaperIcon className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("news.feed.empty")}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-2 size-2 shrink-0 rounded-full",
                    item.read_at ? "bg-transparent" : "bg-primary",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => openItem(item)}
                    className={cn(
                      "inline-flex items-center gap-1.5 font-medium hover:underline",
                      item.read_at
                        ? "text-muted-foreground"
                        : "text-foreground",
                    )}
                  >
                    {item.title}
                    <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                  {item.summary ? (
                    <p className="text-sm text-muted-foreground">
                      {item.summary}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="secondary">{item.topic_name}</Badge>
                    {item.domain ? (
                      <Badge variant="outline">{item.domain}</Badge>
                    ) : null}
                    <Badge variant="ghost">
                      {item.from_configured_source
                        ? t("news.feed.source_chip")
                        : t("news.feed.search_chip")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.published_at ?? item.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {total > 0 ? (
            <Card className="p-0">
              <DataTablePagination
                page={page}
                size={size}
                total={total}
                onPageChange={onPageChange}
                onSizeChange={onSizeChange}
                labels={{
                  rowsPerPage: t("common.pagination.rows_per_page"),
                  pageOf: t("common.pagination.page_of"),
                  previous: t("common.pagination.previous"),
                  next: t("common.pagination.next"),
                }}
              />
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
