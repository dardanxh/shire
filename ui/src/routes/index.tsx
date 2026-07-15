import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MergeReviewsListPage } from "@/features/merge-reviews";
import { RepositoriesListPage } from "@/features/repositories";

const VIEW_VALUES = ["repositories", "mrs"] as const;
type HubView = (typeof VIEW_VALUES)[number];

const searchSchema = z.object({
  view: z.enum(VIEW_VALUES).catch("repositories"),
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().int().min(1).catch(20),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  staticData: { crumb: "common.nav.repositories" },
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { view, page, size } = Route.useSearch();
  const navigate = Route.useNavigate();

  const listProps = {
    page,
    size,
    onPageChange: (next: number) =>
      navigate({ search: (prev) => ({ ...prev, page: next }) }),
    onSizeChange: (next: number) =>
      navigate({ search: (prev) => ({ ...prev, size: next, page: 1 }) }),
  };

  return (
    <div className="space-y-6">
      <Tabs
        value={view}
        onValueChange={(next) =>
          navigate({
            search: (prev) => ({ ...prev, view: next as HubView, page: 1 }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="repositories">
            {t("common.nav.repositories")}
          </TabsTrigger>
          <TabsTrigger value="mrs">{t("common.nav.merge_reviews")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "repositories" ? (
        <RepositoriesListPage {...listProps} />
      ) : (
        <MergeReviewsListPage {...listProps} />
      )}
    </div>
  );
}
