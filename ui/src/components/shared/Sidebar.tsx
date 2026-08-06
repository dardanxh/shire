import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpenIcon,
  ChevronDownIcon,
  CpuIcon,
  DatabaseIcon,
  FolderGitIcon,
  GaugeIcon,
  GlobeIcon,
  HighlighterIcon,
  HomeIcon,
  LandmarkIcon,
  LayersIcon,
  LayoutGridIcon,
  ListChecksIcon,
  type LucideIcon,
  MapIcon,
  NewspaperIcon,
  PlugIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { APPS } from "@/features/apps";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Required by targets with `validateSearch` (typed links need an explicit search). */
  search?: Record<string, unknown>;
  /** Active when the pathname matches this item (prefix-aware). */
  match: (pathname: string) => boolean;
};

/** Ungrouped landing entry, rendered above the labeled groups. */
const HOME_ITEMS: NavItem[] = [
  {
    to: "/",
    labelKey: "common.nav.home",
    icon: HomeIcon,
    match: (p) => p === "/",
  },
];

/** The objects you manage. */
const WORKSPACE_ITEMS: NavItem[] = [
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
    to: "/developments",
    labelKey: "common.nav.developments",
    icon: NewspaperIcon,
    search: { tab: "feed" },
    match: (p) => p === "/developments",
  },
  {
    to: "/highlights",
    labelKey: "common.nav.highlights",
    icon: HighlighterIcon,
    search: { page: 1, size: 20 },
    match: (p) => p === "/highlights",
  },
  {
    to: "/members",
    labelKey: "common.nav.members",
    icon: UsersIcon,
    match: (p) => p === "/members" || p.startsWith("/members/"),
  },
];

/** AI-driven analysis modules. */
const INTELLIGENCE_ITEMS: NavItem[] = [
  {
    to: "/hobits",
    labelKey: "common.nav.hobits",
    icon: BookOpenIcon,
    match: (p) => p === "/hobits" || p.startsWith("/hobits/"),
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
    to: "/principles",
    labelKey: "common.nav.principles",
    icon: ScaleIcon,
    match: (p) => p === "/principles" || p.startsWith("/principles/"),
  },
  {
    to: "/news",
    labelKey: "common.nav.news",
    icon: GlobeIcon,
    match: (p) => p === "/news" || p.startsWith("/news/"),
  },
];

/** Infrastructure: queue, analysis tooling, provider credentials. */
const PLATFORM_ITEMS: NavItem[] = [
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

/** Reference catalogs ported from Tuesdayta, grouped under a "Knowledge" label. */
const KNOWLEDGE_ITEMS: NavItem[] = [
  {
    to: "/architectures",
    labelKey: "common.nav.architectures",
    icon: LayersIcon,
    search: { tab: "blueprints" },
    match: (p) => p === "/architectures" || p.startsWith("/architectures/"),
  },
  {
    to: "/technologies",
    labelKey: "common.nav.technologies",
    icon: CpuIcon,
    search: {},
    match: (p) => p === "/technologies" || p.startsWith("/technologies/"),
  },
  {
    to: "/data",
    labelKey: "common.nav.modelling",
    icon: DatabaseIcon,
    search: { tab: "modelling" },
    match: (p) => p === "/data" || p.startsWith("/data/"),
  },
  {
    to: "/security",
    labelKey: "common.nav.security",
    icon: ShieldIcon,
    search: { tab: "regulations" },
    match: (p) => p === "/security" || p.startsWith("/security/"),
  },
  {
    to: "/qualities",
    labelKey: "common.nav.qualities",
    icon: GaugeIcon,
    search: { tab: "catalog" },
    match: (p) => p === "/qualities" || p.startsWith("/qualities/"),
  },
];

/** Single launcher entry; individual apps live on the /apps card grid. */
const APPS_ITEMS: NavItem[] = [
  {
    to: "/apps",
    labelKey: "common.nav.apps",
    icon: LayoutGridIcon,
    // Stays highlighted while inside any app the launcher links to.
    match: (p) =>
      p === "/apps" ||
      APPS.some((app) => p === app.to || p.startsWith(`${app.to}/`)),
  },
];

/** A labeled nav group whose label toggles its items; open state survives reloads. */
function CollapsibleNavGroup({
  id,
  labelKey,
  items,
  pathname,
}: {
  id: string;
  labelKey: string;
  items: NavItem[];
  pathname: string;
}) {
  const { t } = useTranslation();
  const storageKey = `sidebar-group-${id}`;
  const [open, setOpen] = useState<boolean>(
    () => localStorage.getItem(storageKey) !== "0",
  );
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <SidebarGroup>
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="w-full cursor-pointer justify-between transition-colors hover:text-sidebar-foreground"
        >
          {t(labelKey)}
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform",
              !open && "-rotate-90",
            )}
          />
        </SidebarGroupLabel>
        <CollapsiblePanel>
          <SidebarGroupContent>
            <NavItemsMenu items={items} pathname={pathname} />
          </SidebarGroupContent>
        </CollapsiblePanel>
      </SidebarGroup>
    </Collapsible>
  );
}

function NavItemsMenu({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  const { t } = useTranslation();
  return (
    <SidebarMenu>
      {items.map((item) => {
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
  );
}

/** App navigation on the shadcn sidebar (icon-collapsible; state persists via cookie). */
export function AppSidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavItemsMenu items={HOME_ITEMS} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        <CollapsibleNavGroup
          id="workspace"
          labelKey="common.nav.group_workspace"
          items={WORKSPACE_ITEMS}
          pathname={pathname}
        />
        <CollapsibleNavGroup
          id="intelligence"
          labelKey="common.nav.group_intelligence"
          items={INTELLIGENCE_ITEMS}
          pathname={pathname}
        />
        <CollapsibleNavGroup
          id="platform"
          labelKey="common.nav.group_platform"
          items={PLATFORM_ITEMS}
          pathname={pathname}
        />
        <CollapsibleNavGroup
          id="knowledge"
          labelKey="common.nav.group_knowledge"
          items={KNOWLEDGE_ITEMS}
          pathname={pathname}
        />
        <SidebarGroup>
          <SidebarGroupContent>
            <NavItemsMenu items={APPS_ITEMS} pathname={pathname} />
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
