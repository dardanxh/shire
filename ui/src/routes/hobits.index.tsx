import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefingPage } from "@/features/briefing";
import { HobitFormDialog, HobitsListPage } from "@/features/hobits";

const TAB_VALUES = ["hobits", "feed"] as const;
type HobitsTab = (typeof TAB_VALUES)[number];

const searchSchema = z.object({
  tab: z.enum(TAB_VALUES).catch("hobits"),
  tags: z.array(z.string()).default([]).catch([]),
  q: z.string().default("").catch(""),
});

export const Route = createFileRoute("/hobits/")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { tab, tags, q } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="space-y-6">
      {/* One row: tabs left, page action right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {tab === "hobits" ? (
          <HobitFormDialog
            trigger={
              <Button size="sm">
                <PlusIcon className="size-4" />
                {t("hobits.list.new_hobit")}
              </Button>
            }
          />
        ) : null}
      </div>

      {tab === "hobits" ? (
        <HobitsListPage
          tags={tags}
          query={q}
          onTagsChange={(next) =>
            navigate({ search: (prev) => ({ ...prev, tags: next }) })
          }
          onQueryChange={(next) =>
            navigate({
              search: (prev) => ({ ...prev, q: next }),
              replace: true,
            })
          }
        />
      ) : (
        <BriefingPage />
      )}
    </div>
  );
}
