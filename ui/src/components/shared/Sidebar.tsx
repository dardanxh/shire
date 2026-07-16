import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpenIcon,
  FolderGitIcon,
  GlobeIcon,
  HomeIcon,
  ListChecksIcon,
  type LucideIcon,
  MapIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlugIcon,
  ScaleIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "shire.sidebar.collapsed";

type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Required by targets with `validateSearch` (typed links need an explicit search). */
  search?: Record<string, unknown>;
  /** Active when the pathname matches this item (prefix-aware). */
  match: (pathname: string) => boolean;
};

const ITEMS: NavItem[] = [
  {
    to: "/",
    labelKey: "common.nav.home",
    icon: HomeIcon,
    match: (p) => p === "/",
  },
  {
    to: "/repositories",
    labelKey: "common.nav.repositories",
    icon: FolderGitIcon,
    search: { view: "repositories", page: 1, size: 20 },
    // MR reviews live as a tab of the repositories hub, so their detail
    // pages keep this module highlighted.
    match: (p) =>
      p.startsWith("/repositories") || p.startsWith("/merge-reviews"),
  },
  {
    to: "/hobits",
    labelKey: "common.nav.hobits",
    icon: BookOpenIcon,
    match: (p) => p === "/hobits" || p.startsWith("/hobits/"),
  },
  {
    to: "/news",
    labelKey: "common.nav.news",
    icon: GlobeIcon,
    match: (p) => p === "/news" || p.startsWith("/news/"),
  },
  {
    to: "/roadmaps",
    labelKey: "common.nav.roadmaps",
    icon: MapIcon,
    match: (p) => p === "/roadmaps" || p.startsWith("/roadmaps/"),
  },
  {
    to: "/members",
    labelKey: "common.nav.members",
    icon: UsersIcon,
    match: (p) => p === "/members" || p.startsWith("/members/"),
  },
  {
    to: "/principles",
    labelKey: "common.nav.principles",
    icon: ScaleIcon,
    match: (p) => p === "/principles" || p.startsWith("/principles/"),
  },
  {
    to: "/jobs",
    labelKey: "common.nav.jobs",
    icon: ListChecksIcon,
    match: (p) => p === "/jobs" || p.startsWith("/jobs/"),
  },
  {
    to: "/tools",
    labelKey: "common.nav.tools",
    icon: WrenchIcon,
    match: (p) => p === "/tools" || p.startsWith("/tools/"),
  },
  {
    to: "/connectors",
    labelKey: "common.nav.connectors",
    icon: PlugIcon,
    match: (p) => p === "/connectors" || p.startsWith("/connectors/"),
  },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Collapse preference persists across sessions; the setter owns the write so
  // no effect is needed to keep localStorage in sync.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "1",
  );
  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <Link
        to="/"
        className={cn(
          "flex items-center gap-2 py-5",
          collapsed ? "justify-center px-0" : "px-5",
        )}
        aria-label={`${t("common.app.name")} home`}
      >
        <img src="/logo.svg" alt="" aria-hidden className="size-9 rounded-md" />
      </Link>

      <nav className="flex flex-col gap-1 px-3 pt-2">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              search={item.search}
              aria-current={active ? "page" : undefined}
              title={collapsed ? t(item.labelKey) : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "px-2.5",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {collapsed ? null : t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "mt-auto flex items-center gap-2 py-3",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={
            collapsed ? t("common.nav.expand") : t("common.nav.collapse")
          }
          title={collapsed ? t("common.nav.expand") : t("common.nav.collapse")}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpenIcon className="size-4" />
          ) : (
            <PanelLeftCloseIcon className="size-4" />
          )}
        </button>
        {collapsed ? null : (
          <p className="truncate text-xs text-muted-foreground">
            {t("common.app.tagline")}
          </p>
        )}
      </div>
    </aside>
  );
}
