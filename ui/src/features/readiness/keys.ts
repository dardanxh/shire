/** Query-key factory for the AI-readiness overview feature. */
export const readinessKeys = {
  all: ["readiness"] as const,
  overview: () => [...readinessKeys.all, "overview"] as const,
};
