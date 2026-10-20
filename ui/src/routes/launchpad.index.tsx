import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { LaunchpadPage } from "@/features/launchpad";

const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  starred: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/launchpad/")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <LaunchpadPage
      search={search}
      onSearchChange={(next, replace) =>
        navigate({ search: (prev) => ({ ...prev, ...next }), replace })
      }
    />
  );
}
