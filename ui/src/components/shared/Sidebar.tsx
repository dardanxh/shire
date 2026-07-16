import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpenIcon,
  FolderGitIcon,
  GlobeIcon,
  ListChecksIcon,
  type LucideIcon,
  MapIcon,
  PlugIcon,
  ScaleIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Active when the pathname matches this item (prefix-aware). */
  match: (pathname: string) => boolean;
};

const ITEMS: NavItem[] = [
  {
    to: "/",
    labelKey: "common.nav.repositories",
    icon: FolderGitIcon,
    // MR reviews live as a tab of the repositories hub, so their detail
    // pages keep this module highlighted.
    match: (p) =>
      p === "/" ||
      p.startsWith("/repositories") ||
      p.startsWith("/merge-reviews"),
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

  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-border bg-background">
      <Link
        to="/"
        search={{ view: "repositories", page: 1, size: 20 }}
        className="flex items-center gap-2 px-5 py-5"
        aria-label={`${t("common.app.name")} home`}
      >
        <span
          className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          aria-hidden
        >
          H
        </span>
        <span className="text-lg font-semibold tracking-tight">
          {t("common.app.name")}
        </span>
      </Link>

      <nav className="flex flex-col gap-1 px-3">
        <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("common.nav.modules")}
        </p>
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <p className="mt-auto px-5 py-4 text-xs text-muted-foreground">
        {t("common.app.tagline")}
      </p>
    </aside>
  );
}
