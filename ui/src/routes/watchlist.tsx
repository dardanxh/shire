import { createFileRoute } from "@tanstack/react-router";

import { WatchlistPage } from "@/features/watchlist";

export const Route = createFileRoute("/watchlist")({
  component: WatchlistPage,
  staticData: { crumb: "common.nav.watchlist" },
});
