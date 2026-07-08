import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ErrorBoundary } from "react-error-boundary";

import { AppShell } from "@/components/shared/AppShell";
import { ErrorFallback } from "@/components/shared/ErrorFallback";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AppShell>
      {/* Route-level boundary so a page crash doesn't take down the shell. */}
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Outlet />
      </ErrorBoundary>
    </AppShell>
  );
}
