import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  CopyIcon,
  HighlighterIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage, type HighlightOut } from "@/lib/api";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import { useDeleteHighlightMutation, useHighlightsQuery } from "../api";
import { highlightTarget } from "../source";

/**
 * The Highlights module: every passage kept while reading, newest first. Each entry is the
 * quoted text, when it was saved, and the way back to the page it came from.
 */
export function HighlightsPage({
  page,
  size,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useHighlightsQuery({
    page,
    page_size: size,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t("highlights.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("highlights.desc")}
        </p>
      </div>

      {isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {t("highlights.load_error", {
              message: extractErrorMessage(error),
            })}
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <HighlighterIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">{t("highlights.empty_title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("highlights.empty_body")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((highlight) => (
              <HighlightCard key={highlight.id} highlight={highlight} />
            ))}
          </div>
          {total > size ? (
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
        </>
      )}
    </div>
  );
}

function HighlightCard({ highlight }: { highlight: HighlightOut }) {
  const { t } = useTranslation();
  const { mutate: deleteHighlight, isPending: isDeleting } =
    useDeleteHighlightMutation();
  const target = highlightTarget(highlight);

  return (
    <Card className="group">
      <CardContent className="flex flex-col gap-3">
        {/* The passage itself leads — quoted, so it reads as someone else's words. */}
        <blockquote className="border-l-2 border-warning pl-3 text-sm leading-relaxed">
          {highlight.text}
        </blockquote>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span title={formatDateTime(highlight.created_at)}>
            {formatTimeAgo(highlight.created_at)}
          </span>
          <span>·</span>
          <span className="truncate">{highlight.source_label}</span>
          <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                navigator.clipboard
                  .writeText(highlight.text)
                  .then(() => toast.success(t("highlights.copied")));
              }}
            >
              <CopyIcon className="size-3" />
              {t("highlights.copy")}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={isDeleting}
              title={t("highlights.delete")}
              aria-label={t("highlights.delete")}
              onClick={() =>
                deleteHighlight(highlight.id, {
                  onSuccess: () => toast.success(t("highlights.deleted")),
                })
              }
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </span>
        </div>
        {target ? (
          // `to` and its params are a discriminated union from `highlightTarget`, so the typed
          // Link accepts the spread as one of its valid shapes.
          <Link
            {...target}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {t("highlights.open")}
            <ArrowRightIcon className="size-3" />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("highlights.no_link")}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
