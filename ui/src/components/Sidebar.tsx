"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderGitIcon, WrenchIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matches when the pathname starts with `href` (for nested routes). */
  match: (pathname: string) => boolean;
};

const items: NavItem[] = [
  {
    href: "/",
    label: "Repositories",
    icon: FolderGitIcon,
    match: (p) => p === "/" || p.startsWith("/repositories"),
  },
  {
    href: "/tools",
    label: "Tools",
    icon: WrenchIcon,
    match: (p) => p.startsWith("/tools"),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-border bg-background">
      <Link
        href="/"
        className="flex items-center gap-2 px-5 py-5"
        aria-label="Hobits home"
      >
        <span
          className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          aria-hidden
        >
          H
        </span>
        <span className="text-lg font-semibold tracking-tight">Hobits</span>
      </Link>

      <nav className="flex flex-col gap-1 px-3">
        <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Modules
        </p>
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <p className="mt-auto px-5 py-4 text-xs text-muted-foreground">
        repository insights
      </p>
    </aside>
  );
}
