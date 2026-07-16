import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NewsPage, type NewsTab } from "@/features/news";

const searchSchema = z.object({
  tab: z.enum(["feed", "topics"]).catch("feed"),
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().int().min(1).catch(20),
  topic: z.string().optional().catch(undefined),
  unread: z.coerce.boolean().catch(false),
});

export const Route = createFileRoute("/news")({
  staticData: { crumb: "common.nav.news" },
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { tab, page, size, topic, unread } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <NewsPage
      tab={tab}
      page={page}
      size={size}
      topic={topic}
      unread={unread}
      onTabChange={(next: NewsTab) =>
        navigate({ search: (prev) => ({ ...prev, tab: next, page: 1 }) })
      }
      onPageChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, page: next }) })
      }
      onSizeChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, size: next, page: 1 }) })
      }
      onTopicChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, topic: next, page: 1 }) })
      }
      onUnreadChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, unread: next, page: 1 }) })
      }
    />
  );
}
