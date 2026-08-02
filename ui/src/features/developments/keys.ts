export const watchlistKeys = {
  all: ["watchlist"] as const,
  digest: () => [...watchlistKeys.all, "digest"] as const,
};
