export const watchlistKeys = {
  all: ["watchlist"] as const,
  digest: () => [...watchlistKeys.all, "digest"] as const,
  pulse: (since: string, until: string | undefined, repos: string[]) =>
    [
      ...watchlistKeys.all,
      "pulse",
      since,
      until ?? null,
      [...repos].sort(),
    ] as const,
};
