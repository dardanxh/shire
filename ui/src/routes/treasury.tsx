import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { TreasuryPage } from "@/features/treasury";

const searchSchema = z.object({
  window: z.enum(["7d", "30d", "month", "all"]).catch("30d"),
});

export const Route = createFileRoute("/treasury")({
  validateSearch: searchSchema,
  staticData: { crumb: "treasury.crumb" },
  component: RouteComponent,
});

function RouteComponent() {
  const { window } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <TreasuryPage
      window={window}
      onWindowChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, window: next }) })
      }
    />
  );
}
