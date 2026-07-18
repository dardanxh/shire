import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpenIcon,
  FolderGitIcon,
  GlobeIcon,
  HomeIcon,
  LandmarkIcon,
  ListChecksIcon,
  type LucideIcon,
  MapIcon,
  PlugIcon,
  ScaleIcon,
  SettingsIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

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
    to: "/council",
    labelKey: "common.nav.council",
    icon: LandmarkIcon,
    search: { page: 1, size: 20 },
    match: (p) => p === "/council" || p.startsWith("/council/"),
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

/** App navigation on the shadcn sidebar (icon-collapsible; state persists via cookie). */
export function AppSidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          to="/"
          className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          aria-label={`${t("common.app.name")} home`}
        >
          <img
            src="/logo.svg"
            alt=""
            aria-hidden
            className="size-8 shrink-0 rounded-md"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={t(item.labelKey)}
                      render={
                        <Link
                          to={item.to}
                          search={item.search}
                          aria-current={active ? "page" : undefined}
                        />
                      }
                    >
                      <Icon />
                      <span>{t(item.labelKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/settings")}
              tooltip={t("common.settings.title")}
              render={
                <Link
                  to="/settings"
                  aria-current={
                    pathname.startsWith("/settings") ? "page" : undefined
                  }
                />
              }
            >
              <SettingsIcon />
              <span>{t("common.settings.title")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
