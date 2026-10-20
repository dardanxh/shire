import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BOOKMARK_TABS, BookmarkViewPage } from "@/features/launchpad";

const searchSchema = z.object({
  tab: z.enum(BOOKMARK_TABS).catch("details"),
  page: z.coerce.number().int().min(1).catch(1),
});

export const Route = createFileRoute("/launchpad/$id")({
  validateSearch: searchSchema,
  staticData: { crumb: "launchpad.view.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { tab, page } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BookmarkViewPage
      id={id}
      tab={tab}
      page={page}
      onTabChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, tab: next, page: 1 }) })
      }
      onPageChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, page: next }) })
      }
    />
  );
}
