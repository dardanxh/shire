/** License-cost / ops-burden profile per tech stack (labels + notes via i18n). */
export type ProfileLevel = "low" | "medium" | "high";

export const STACK_PROFILES: Record<
  string,
  { license: ProfileLevel; ops: ProfileLevel }
> = {
  stack_aws: { license: "medium", ops: "medium" },
  stack_azure: { license: "medium", ops: "medium" },
  stack_gcp: { license: "medium", ops: "medium" },
  stack_open_source: { license: "low", ops: "high" },
  stack_snowflake: { license: "high", ops: "low" },
  stack_databricks: { license: "high", ops: "medium" },
};
