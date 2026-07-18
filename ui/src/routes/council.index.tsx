import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CouncilsListPage } from "@/features/council";

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().int().min(1).catch(20),
});

export const Route = createFileRoute("/council/")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { page, size } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <CouncilsListPage
      page={page}
      size={size}
      onPageChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, page: next }) })
      }
      onSizeChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, size: next, page: 1 }) })
      }
    />
  );
}
