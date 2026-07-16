import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RoadmapViewPage } from "@/features/roadmaps";
import { ROADMAP_TAB_VALUES } from "@/features/roadmaps/tabs";

const searchSchema = z.object({
  tab: z.enum(ROADMAP_TAB_VALUES).catch("board"),
  // Absent = the current version; set = a historical (read-only) version.
  version: z.coerce.number().int().min(1).optional().catch(undefined),
  // The open item dialog (URL-first so item links are shareable).
  item: z.string().optional().catch(undefined),
  // Timeline/table milestone filter.
  milestone: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/roadmaps/$id")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { tab, version, item, milestone } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RoadmapViewPage
      id={id}
      tab={tab}
      version={version}
      itemId={item}
      milestoneId={milestone}
      onTabChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, tab: next }) })
      }
      onVersionChange={(next) =>
        navigate({
          search: (prev) => ({ ...prev, version: next, item: undefined }),
        })
      }
      onOpenItem={(itemId) =>
        navigate({ search: (prev) => ({ ...prev, item: itemId }) })
      }
      onCloseItem={() =>
        navigate({ search: (prev) => ({ ...prev, item: undefined }) })
      }
      onSelectMilestone={(milestoneId) =>
        navigate({ search: (prev) => ({ ...prev, milestone: milestoneId }) })
      }
    />
  );
}
