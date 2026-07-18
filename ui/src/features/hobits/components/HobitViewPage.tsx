import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BriefingFeed,
  BriefingPostDialog,
  useBriefingQuery,
  useMarkHobitPostsReadMutation,
  useMarkPostReadMutation,
} from "@/features/briefing";
import {
  type BriefingItemOut,
  extractErrorMessage,
  type HobitRunOut,
} from "@/lib/api";
import { useCrumbOverride } from "@/lib/crumb";
import { formatDateTime } from "@/lib/format";
import { useHobitQuery, useHobitRunsQuery } from "../api";
import { DeleteHobitDialog } from "./DeleteHobitDialog";
import { HobitConfigForm } from "./HobitConfigForm";
import { HobitFormDialog } from "./HobitFormDialog";
import { HobitGuidanceCard } from "./HobitGuidanceCard";
import { TagsEditor } from "./TagsEditor";

export function HobitViewPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: hobit, isPending, isError, error } = useHobitQuery(slug);
  const { data: runs } = useHobitRunsQuery(slug);
  const { data: posts } = useBriefingQuery(slug);
  const { mutate: markAllRead } = useMarkHobitPostsReadMutation();
  const { mutate: markRead } = useMarkPostReadMutation();
  const [selectedPost, setSelectedPost] = useState<BriefingItemOut | null>(
    null,
  );

  // The page has no title of its own — the hobit's name is the breadcrumb leaf.
  useCrumbOverride(hobit?.name);

  // Opening a hobit marks its posts seen (clears its unread count).
  useEffect(() => {
    markAllRead(slug);
  }, [slug, markAllRead]);

  const openPost = (post: BriefingItemOut) => {
    setSelectedPost(post);
    if (!post.read_at) markRead(post.id);
  };

  const columns = useMemo<ColumnDef<HobitRunOut>[]>(
    () => [
      {
        accessorKey: "status",
        header: t("hobits.view.run_status"),
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "tier",
        header: t("hobits.view.run_tier"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.tier ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "headline",
        header: t("hobits.view.run_headline"),
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-lg text-sm">
            {row.original.headline ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "started_at",
        header: t("hobits.view.run_when"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(row.original.started_at)}
          </span>
        ),
      },
    ],
    [t],
  );

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError || !hobit) {
    return (
      <Card className="p-6 text-sm text-destructive">
        {error ? extractErrorMessage(error) : t("common.states.error_body")}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs">
            {hobit.category}
          </Badge>
          <TagsEditor hobit={hobit} />
        </div>
        <div className="flex items-center gap-2">
          {hobit.custom ? (
            <>
              <HobitFormDialog
                hobit={hobit}
                trigger={
                  <Button size="sm" variant="outline">
                    <PencilIcon className="size-3.5" />
                    {t("hobits.form.edit")}
                  </Button>
                }
              />
              <DeleteHobitDialog
                slug={hobit.slug}
                name={hobit.name}
                onDeleted={() =>
                  navigate({ to: "/hobits", search: { tab: "hobits" } })
                }
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2Icon className="size-3.5" />
                    {t("hobits.delete.confirm")}
                  </Button>
                }
              />
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent>
          <HobitConfigForm hobit={hobit} />
        </CardContent>
      </Card>

      <HobitGuidanceCard slug={slug} />

      <Card>
        <CardHeader>
          <CardTitle>{t("hobits.view.timeline_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(posts?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("briefing.hobit_timeline_empty")}
            </p>
          ) : (
            <BriefingFeed items={posts ?? []} onSelect={openPost} />
          )}
        </CardContent>
      </Card>

      <BriefingPostDialog
        post={selectedPost}
        onClose={() => setSelectedPost(null)}
      />

      <Card className="overflow-hidden p-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>{t("hobits.view.runs_title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <DataTable
            columns={columns}
            data={runs ?? []}
            emptyState={
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("hobits.view.runs_empty")}
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
