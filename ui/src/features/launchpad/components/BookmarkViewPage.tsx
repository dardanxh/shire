import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  ImageUpIcon,
  PencilIcon,
  RefreshCwIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useBookmarkActionQuery,
  useBookmarkQuery,
  useRecordVisitMutation,
  useRefreshLogoMutation,
  useUpdateBookmarkMutation,
  useUploadLogoMutation,
} from "../api";
import { ActionForm } from "./ActionForm";
import { ActionRunsList } from "./ActionRunsList";
import { BookmarkFormDialog } from "./BookmarkFormDialog";
import { BookmarkLogo } from "./BookmarkLogo";
import { DeleteBookmarkDialog } from "./DeleteBookmarkDialog";

export const BOOKMARK_TABS = ["details", "action", "runs"] as const;
export type BookmarkTab = (typeof BOOKMARK_TABS)[number];

const MAX_LOGO_BYTES = 256 * 1024;
const LIST_SEARCH = {} as const;

/** One bookmark: visit it, edit it, and configure + review its action. */
export function BookmarkViewPage({
  id,
  tab,
  page,
  onTabChange,
  onPageChange,
}: {
  id: string;
  tab: BookmarkTab;
  page: number;
  onTabChange: (tab: BookmarkTab) => void;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: bookmark, isPending, isError } = useBookmarkQuery(id);
  const { data: action, isPending: isActionPending } =
    useBookmarkActionQuery(id);
  const { mutate: updateBookmark } = useUpdateBookmarkMutation(id);
  const { mutate: recordVisit } = useRecordVisitMutation();
  const { mutate: uploadLogo, isPending: isUploading } =
    useUploadLogoMutation(id);
  const { mutate: refreshLogo, isPending: isRefreshing } =
    useRefreshLogoMutation(id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (isError || !bookmark) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {t("launchpad.view.not_found")}
      </Card>
    );
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("launchpad.view.logo_too_big"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      uploadLogo(String(reader.result), {
        onSuccess: () => toast.success(t("launchpad.view.logo_uploaded")),
      });
    reader.readAsDataURL(file);
  };

  const unread = bookmark.action?.unread_count ?? 0;

  return (
    <div className="space-y-6">
      <Link
        to="/launchpad"
        search={LIST_SEARCH}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        {t("launchpad.view.back")}
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <BookmarkLogo bookmark={bookmark} className="size-14 text-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold">
            <span className="truncate">{bookmark.name}</span>
            <button
              type="button"
              onClick={() => updateBookmark({ starred: !bookmark.starred })}
              aria-label={t(
                bookmark.starred
                  ? "launchpad.card.unstar"
                  : "launchpad.card.star",
                { name: bookmark.name },
              )}
              className={cn(
                "rounded-md p-1",
                bookmark.starred
                  ? "text-warning"
                  : "text-muted-foreground/40 hover:text-warning",
              )}
            >
              <StarIcon
                className={cn("size-5", bookmark.starred && "fill-warning")}
              />
            </button>
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {bookmark.url}
          </p>
        </div>
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordVisit(bookmark.id)}
          className={buttonVariants()}
        >
          <ExternalLinkIcon />
          {t("launchpad.card.visit")}
        </a>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => onTabChange(next as BookmarkTab)}
      >
        <TabsList>
          <TabsTrigger value="details">
            {t("launchpad.view.tabs.details")}
          </TabsTrigger>
          <TabsTrigger value="action">
            {t("launchpad.view.tabs.action")}
          </TabsTrigger>
          <TabsTrigger value="runs">
            {t("launchpad.view.tabs.runs")}
            {unread > 0 ? (
              <Badge variant="warning" className="ml-1.5">
                {unread}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "details" ? (
        <Card className="gap-5 p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Meta label={t("launchpad.form.category.label")}>
              {bookmark.category_name ?? t("launchpad.filters.uncategorized")}
            </Meta>
            <Meta label={t("launchpad.view.visits")}>
              {t("launchpad.view.visits_value", {
                count: bookmark.visit_count,
              })}
              {bookmark.last_visited_at
                ? ` · ${t("launchpad.view.last_visit", {
                    at: formatDateTime(bookmark.last_visited_at),
                  })}`
                : ""}
            </Meta>
            <Meta label={t("launchpad.form.notes.label")} wide>
              {bookmark.description || t("common.states.dash")}
            </Meta>
            <Meta label={t("launchpad.form.logo.label")} wide>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    handleFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImageUpIcon />
                  {t("launchpad.view.upload_logo")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRefreshing}
                  onClick={() => refreshLogo()}
                >
                  <RefreshCwIcon
                    className={cn(isRefreshing && "animate-spin")}
                  />
                  {t("launchpad.view.refetch_logo")}
                </Button>
              </div>
            </Meta>
          </dl>
          <div className="flex gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon />
              {t("common.actions.edit")}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setDeleting(true)}
            >
              <Trash2Icon />
              {t("common.actions.delete")}
            </Button>
          </div>
        </Card>
      ) : null}

      {tab === "action" ? (
        isActionPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <ActionForm
            bookmark={bookmark}
            action={action ?? null}
            onRunQueued={() => onTabChange("runs")}
          />
        )
      ) : null}

      {tab === "runs" ? (
        <ActionRunsList
          bookmarkId={id}
          page={page}
          onPageChange={onPageChange}
        />
      ) : null}

      <BookmarkFormDialog
        bookmark={bookmark}
        open={editing}
        onOpenChange={setEditing}
      />
      <DeleteBookmarkDialog
        bookmark={bookmark}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => navigate({ to: "/launchpad", search: LIST_SEARCH })}
      />
    </div>
  );
}

function Meta({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", wide && "sm:col-span-2")}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
