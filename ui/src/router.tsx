import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  // Routes opt into breadcrumbs by setting `staticData: { crumb: "<i18n key>" }`.
  interface StaticDataRouteOption {
    crumb?: string;
    /**
     * Drop the shell's centered max-width and generous padding so the page fills
     * the viewport edge to edge — for canvas pages (pan/zoom diagrams) where the
     * side gutters are wasted space.
     */
    fullBleed?: boolean;
  }
}
