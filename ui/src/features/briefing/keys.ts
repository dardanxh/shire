export const briefingKeys = {
  all: ["briefing"] as const,
  tiered: () => [...briefingKeys.all, "tiered"] as const,
};
