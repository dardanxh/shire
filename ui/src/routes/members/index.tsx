import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MembersPage } from "@/features/members";

const searchSchema = z.object({
  // Anonymized view is deep-linkable so it can be shared without exposing people.
  anonymize: z.boolean().catch(false),
  // Which tab is open — deep-linkable (list · contributions graph · teams dashboard).
  tab: z.enum(["members", "graph", "teams"]).catch("members"),
});

export const Route = createFileRoute("/members/")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { anonymize, tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MembersPage
      tab={tab}
      anonymize={anonymize}
      onTabChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, tab: next }) })
      }
      onAnonymizeChange={(value) =>
        navigate({ search: (prev) => ({ ...prev, anonymize: value }) })
      }
    />
  );
}
