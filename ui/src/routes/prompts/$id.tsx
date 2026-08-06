import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PromptWorkbenchPage } from "@/features/prompts";
// Import the tab constants from the dependency-free module (not the barrel) so this eager,
// module-load import doesn't pull the workbench into the main bundle.
import { PROMPT_TAB_VALUES } from "@/features/prompts/tabs";

// The active tab lives in the URL so it is shareable, survives a refresh, and works with the back
// button. A bad value falls back to the editor.
const searchSchema = z.object({
  tab: z.enum(PROMPT_TAB_VALUES).catch("editor"),
});

export const Route = createFileRoute("/prompts/$id")({
  validateSearch: searchSchema,
  staticData: { crumb: "prompts.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <PromptWorkbenchPage
      id={id}
      tab={tab}
      onTabChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, tab: next }) })
      }
    />
  );
}
