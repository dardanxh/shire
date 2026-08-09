export type TreasuryWindow = "7d" | "30d" | "month" | "all";

export const treasuryKeys = {
  all: ["treasury"] as const,
  overview: () => [...treasuryKeys.all, "overview"] as const,
  breakdowns: () => [...treasuryKeys.all, "breakdown"] as const,
  breakdown: (window: TreasuryWindow) =>
    [...treasuryKeys.breakdowns(), window] as const,
};
