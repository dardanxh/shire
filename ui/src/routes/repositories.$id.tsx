import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RepositoryViewPage } from "@/features/repositories";
// Import the tab constants from the dependency-free module (not the barrel) so
// this eager, module-load import doesn't pull the heavy view into the main
// bundle — keeps the route lazily code-split.
import { REPOSITORY_TAB_VALUES } from "@/features/repositories/tabs";

// The active tab lives in the URL so a tab is shareable, survives refresh, and
// works with the back button. Bad values fall back to the headline tab.
const searchSchema = z.object({
  tab: z.enum(REPOSITORY_TAB_VALUES).catch("overview"),
});

export const Route = createFileRoute("/repositories/$id")({
  validateSearch: searchSchema,
  staticData: { crumb: "repositories.view.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RepositoryViewPage
      id={id}
      tab={tab}
      onTabChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, tab: next }) })
      }
    />
  );
}
