import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MembersListPage } from "@/features/members";

const searchSchema = z.object({
  // Anonymized view is deep-linkable so it can be shared without exposing people.
  anonymize: z.boolean().catch(false),
});

export const Route = createFileRoute("/members")({
  validateSearch: searchSchema,
  staticData: { crumb: "common.nav.members" },
  component: RouteComponent,
});

function RouteComponent() {
  const { anonymize } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MembersListPage
      anonymize={anonymize}
      onAnonymizeChange={(value) =>
        navigate({ search: (prev) => ({ ...prev, anonymize: value }) })
      }
    />
  );
}
