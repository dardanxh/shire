import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefingPage } from "@/features/briefing";
import { HobitsListPage } from "@/features/hobits";

const TAB_VALUES = ["hobits", "feed"] as const;
type HobitsTab = (typeof TAB_VALUES)[number];

const searchSchema = z.object({
  tab: z.enum(TAB_VALUES).catch("hobits"),
});

export const Route = createFileRoute("/hobits/")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="space-y-6">
      <Tabs
        value={tab}
        onValueChange={(next) =>
          navigate({
            search: (prev) => ({ ...prev, tab: next as HobitsTab }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="hobits">{t("hobits.tabs.hobits")}</TabsTrigger>
          <TabsTrigger value="feed">{t("hobits.tabs.feed")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "hobits" ? <HobitsListPage /> : <BriefingPage />}
    </div>
  );
}
