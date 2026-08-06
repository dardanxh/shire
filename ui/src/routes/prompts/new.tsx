import { createFileRoute } from "@tanstack/react-router";

import { NewPromptPage } from "@/features/prompts";

export const Route = createFileRoute("/prompts/new")({
  staticData: { crumb: "prompts.new.title" },
  component: NewPromptPage,
});
