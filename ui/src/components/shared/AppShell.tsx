import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { AppSidebar } from "@/components/shared/Sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * App frame: shadcn sidebar + scrollable main column. `min-w-0` on `<main>` is
 * load-bearing — without it a wide table/chart pushes the page past the
 * viewport instead of letting inner `overflow-x-auto` scroll.
 *
 * Routes with `staticData.fullBleed` opt out of the centered max-width so canvas
 * pages (pan/zoom diagrams) stretch across the whole viewport.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const matches = useMatches();
  const fullBleed = matches.some((m) => m.staticData.fullBleed);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-x-hidden">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
          <SidebarTrigger className="-ml-1" />
          <Breadcrumbs />
        </header>
        <main
          className={cn(
            "mx-auto w-full min-w-0",
            fullBleed ? "max-w-none px-3 py-3" : "max-w-6xl px-4 py-8 sm:px-6",
          )}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
