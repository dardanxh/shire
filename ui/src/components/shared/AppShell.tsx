import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Sidebar } from "@/components/shared/Sidebar";

/**
 * App frame: fixed sidebar + scrollable main column. `min-w-0` on `<main>` is
 * load-bearing — without it a wide table/chart pushes the page past the
 * viewport instead of letting inner `overflow-x-auto` scroll.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
          <Breadcrumbs />
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
