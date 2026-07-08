import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ConnectorsPage } from "@/features/connectors";
import { CONNECTOR_TAB_VALUES } from "@/features/connectors/tabs";

const searchSchema = z.object({
  tab: z.enum(CONNECTOR_TAB_VALUES).catch("connectors"),
});

export const Route = createFileRoute("/connectors")({
  validateSearch: searchSchema,
  staticData: { crumb: "connectors.title" },
  component: RouteComponent,
});

function RouteComponent() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ConnectorsPage
      tab={tab}
      onTabChange={(next) =>
        navigate({ search: (prev) => ({ ...prev, tab: next }) })
      }
    />
  );
}
