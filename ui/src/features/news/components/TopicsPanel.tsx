import type { ColumnDef } from "@tanstack/react-table";
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RssIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractErrorMessage, type NewsTopicOut } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";
import {
  useDeleteTopicMutation,
  useFetchNowMutation,
  useNewsTopicsQuery,
} from "../api";
import { TopicFormDialog } from "./TopicFormDialog";

export function TopicsPanel() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useNewsTopicsQuery();
  const { mutate: fetchNow } = useFetchNowMutation();
  const { mutate: deleteTopic, isPending: isDeleting } =
    useDeleteTopicMutation();

  // One dialog instance, keyed by intent: "new" or the topic being edited/deleted.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NewsTopicOut | null>(null);
  const [deleting, setDeleting] = useState<NewsTopicOut | null>(null);

  const columns = useMemo<ColumnDef<NewsTopicOut>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("news.topics.columns.name"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.original.name}</span>
              {row.original.enabled ? null : (
                <Badge variant="outline">{t("news.topics.disabled")}</Badge>
              )}
            </div>
            {row.original.description ? (
              <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "sources",
        header: t("news.topics.columns.sources"),
        meta: { className: "w-24" },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.sources.length}
          </span>
        ),
      },
      {
        id: "last_poll",
        header: t("news.topics.columns.last_poll"),
        meta: { className: "w-56" },
        cell: ({ row }) => <PollStatus topic={row.original} />,
      },
      {
        accessorKey: "unread_count",
        header: t("news.topics.columns.unread"),
        meta: { className: "w-20" },
        cell: ({ row }) =>
          row.original.unread_count > 0 ? (
            <Badge>{row.original.unread_count}</Badge>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        id: "actions",
        header: "",
        meta: { className: "w-32", isAction: true },
        cell: ({ row }) => {
          const pending = row.original.latest_poll?.status === "pending";
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("news.topics.fetch")}
                title={t("news.topics.fetch")}
                disabled={pending}
                onClick={() => fetchNow(row.original.id)}
              >
                {pending ? (
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <RssIcon className="size-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("news.topics.edit")}
                title={t("news.topics.edit")}
                onClick={() => {
                  setEditing(row.original);
                  setFormOpen(true);
                }}
              >
                <PencilIcon className="size-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("news.topics.delete")}
                title={t("news.topics.delete")}
                onClick={() => setDeleting(row.original)}
              >
                <Trash2Icon className="size-4 text-muted-foreground" />
              </Button>
            </div>
          );
        },
      },
    ],
    [t, fetchNow],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <PlusIcon className="size-4" />
          {t("news.topics.add")}
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={data ?? []}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          emptyState={
            <p className="p-12 text-center text-sm text-muted-foreground">
              {t("news.topics.empty")}
            </p>
          }
        />
      </Card>

      <TopicFormDialog
        topic={editing ?? undefined}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{deleting?.name}</DialogTitle>
            <DialogDescription>
              {t("news.topics.delete_confirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                if (!deleting) return;
                deleteTopic(deleting.id, {
                  onSuccess: () => {
                    toast.success(deleting.name);
                    setDeleting(null);
                  },
                });
              }}
            >
              {isDeleting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              {t("news.topics.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PollStatus({ topic }: { topic: NewsTopicOut }) {
  const { t } = useTranslation();
  const poll = topic.latest_poll;
  if (!poll) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("news.topics.never_polled")}
      </span>
    );
  }
  if (poll.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        {t("news.topics.poll_status.pending")}
      </span>
    );
  }
  if (poll.status === "error") {
    return (
      <span
        className="text-xs text-destructive"
        title={poll.error ?? undefined}
      >
        {t("news.topics.poll_status.error")}
        {topic.last_polled_at
          ? ` · ${formatTimeAgo(topic.last_polled_at)}`
          : ""}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {t("news.topics.poll_status.succeeded", {
        inserted: poll.items_inserted ?? 0,
        found: poll.items_found ?? 0,
      })}
      {poll.finished_at ? ` · ${formatTimeAgo(poll.finished_at)}` : ""}
    </span>
  );
}
