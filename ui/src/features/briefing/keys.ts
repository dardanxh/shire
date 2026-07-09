export const briefingKeys = {
  all: ["briefing"] as const,
  feed: (hobitSlug?: string) =>
    [...briefingKeys.all, "feed", hobitSlug ?? "all"] as const,
  runDetail: (repoId: string, runId: string) =>
    [...briefingKeys.all, "run", repoId, runId] as const,
};
