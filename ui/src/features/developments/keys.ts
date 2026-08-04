export const watchlistKeys = {
  all: ["watchlist"] as const,
  digest: () => [...watchlistKeys.all, "digest"] as const,
  pulse: (since: string, repos: string[]) =>
    [...watchlistKeys.all, "pulse", since, [...repos].sort()] as const,
};
