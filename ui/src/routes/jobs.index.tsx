import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  JobsConfigPanel,
  JobsListPage,
  JobsStatsHeader,
} from "@/features/jobs";
import { JOB_STATUSES } from "@/lib/api";

const TAB_VALUES = ["runs", "config"] as const;
type JobsTab = (typeof TAB_VALUES)[number];

const searchSchema = z.object({
  tab: z.enum(TAB_VALUES).catch("runs"),
  status: z.enum(JOB_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().int().min(1).catch(20),
});

export const Route = createFileRoute("/jobs/")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { tab, status, page, size } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="space-y-6">
      <Tabs
        value={tab}
        onValueChange={(next) =>
          navigate({
            search: (prev) => ({ ...prev, tab: next as JobsTab, page: 1 }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="runs">{t("jobs.tabs.runs")}</TabsTrigger>
          <TabsTrigger value="config">{t("jobs.tabs.config")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "runs" ? (
        <div className="space-y-4">
          <JobsStatsHeader />
          <JobsListPage
            page={page}
            size={size}
            status={status}
            onPageChange={(next) =>
              navigate({ search: (prev) => ({ ...prev, page: next }) })
            }
            onSizeChange={(next) =>
              navigate({
                search: (prev) => ({ ...prev, size: next, page: 1 }),
              })
            }
            onStatusChange={(next) =>
              navigate({
                search: (prev) => ({ ...prev, status: next, page: 1 }),
              })
            }
          />
        </div>
      ) : (
        <JobsConfigPanel />
      )}
    </div>
  );
}
