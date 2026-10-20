import { useNavigate } from "@tanstack/react-router";
import {
  BellIcon,
  BellRingIcon,
  CheckCheckIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatTimeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type ActionRun,
  useLaunchpadNotificationsQuery,
  useMarkAllReadMutation,
  useMarkRunReadMutation,
} from "../api";

const NOTIFIED_KEY = "launchpad-notified-runs";
const NOTIFIED_LIMIT = 200;

function supportsDesktop() {
  return typeof window !== "undefined" && "Notification" in window;
}

function loadNotified(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * Header bell for Launchpad action runs that need you. Polls in the background
 * and, with permission, raises a desktop notification once per run (tracked in
 * localStorage, so reloads and other tabs don't repeat it).
 */
export function NotificationsBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useLaunchpadNotificationsQuery();
  const { mutate: markRead } = useMarkRunReadMutation();
  const { mutate: markAllRead, isPending: isMarkingAll } =
    useMarkAllReadMutation();
  const [permission, setPermission] = useState(() =>
    supportsDesktop() ? Notification.permission : "denied",
  );
  const unread = data?.unread_count ?? 0;

  // Side effect: hand newly-seen runs to the OS notification centre, once each.
  useEffect(() => {
    if (!data || permission !== "granted") return;
    const notified = new Set(loadNotified());
    const fresh = data.items.filter((run) => !notified.has(run.id));
    for (const run of fresh) {
      const note = new Notification(
        t("launchpad.bell.desktop_title", { name: run.bookmark_name }),
        { body: run.summary ?? "", tag: run.id },
      );
      note.onclick = () => {
        window.focus();
        navigate({
          to: "/launchpad/$id",
          params: { id: run.bookmark_id },
          search: { tab: "runs", page: 1 },
        });
      };
      notified.add(run.id);
    }
    if (fresh.length > 0) {
      localStorage.setItem(
        NOTIFIED_KEY,
        JSON.stringify([...notified].slice(-NOTIFIED_LIMIT)),
      );
    }
  }, [data, permission, navigate, t]);

  const enableDesktop = () => {
    // Mark what's already unread as notified so enabling doesn't burst old items.
    localStorage.setItem(
      NOTIFIED_KEY,
      JSON.stringify([
        ...loadNotified(),
        ...(data?.items ?? []).map((r) => r.id),
      ]),
    );
    Notification.requestPermission().then(setPermission);
  };

  const open = (run: ActionRun) => {
    markRead(run.id);
    navigate({
      to: "/launchpad/$id",
      params: { id: run.bookmark_id },
      search: { tab: "runs", page: 1 },
    });
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={t("launchpad.bell.aria", { count: unread })}
          />
        }
      >
        {unread > 0 ? (
          <BellRingIcon className="text-amber-600" />
        ) : (
          <BellIcon />
        )}
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="text-sm font-semibold">
            {t("launchpad.bell.title")}
          </span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={isMarkingAll}
              onClick={() => markAllRead()}
            >
              <CheckCheckIcon />
              {t("launchpad.bell.mark_all_read")}
            </Button>
          ) : null}
        </div>
        {data && data.items.length > 0 ? (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {data.items.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => open(run)}
                  className="w-full space-y-1 px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        run.outcome === "error"
                          ? "bg-destructive"
                          : "bg-amber-500",
                      )}
                    />
                    <span className="truncate font-medium">
                      {run.bookmark_name}
                    </span>
                    {run.new_count > 0 ? (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {t("launchpad.runs.new", { count: run.new_count })}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatTimeAgo(run.created_at)}
                    </span>
                  </div>
                  {run.summary ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {run.summary}
                    </p>
                  ) : null}
                </button>
                {run.items.filter((i) => i.is_new && i.url).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
                    {run.items
                      .filter((i) => i.is_new && i.url)
                      .slice(0, 4)
                      .map((item) => (
                        <a
                          key={item.key}
                          href={item.url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                        >
                          {item.key}
                          <ExternalLinkIcon className="size-3" />
                        </a>
                      ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("launchpad.bell.empty")}
          </p>
        )}
        {supportsDesktop() && permission === "default" ? (
          <div className="border-t px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={enableDesktop}
            >
              {t("launchpad.bell.enable_desktop")}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
