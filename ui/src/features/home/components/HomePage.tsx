import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage } from "@/lib/api";
import { useHomeStatusQuery } from "../api";
import { AttentionCard } from "./AttentionCard";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import { QuickActionsCard } from "./QuickActionsCard";
import { SpendCard } from "./SpendCard";
import { SystemStatusCard } from "./SystemStatusCard";
import { ToolsCard } from "./ToolsCard";

/** The landing page: brand header, system health, the onboarding checklist, and tool coverage. */
export function HomePage() {
  const { t } = useTranslation();
  const { data: status, isPending, isError, error } = useHomeStatusQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <img
          src="/logo.svg"
          alt=""
          aria-hidden
          className="size-10 shrink-0 rounded-lg"
        />
        <div>
          <h1 className="font-heading text-2xl font-semibold leading-tight">
            {t("home.hero.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("home.hero.subtitle")}
          </p>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {isError ? (
        <Card className="p-6 text-sm text-destructive">
          {extractErrorMessage(error)}
        </Card>
      ) : null}

      {status ? (
        <div className="space-y-4">
          <QuickActionsCard status={status} />
          <AttentionCard status={status} />
          <SystemStatusCard status={status} />
          <OnboardingChecklistCard status={status} />
          <SpendCard />
          <ToolsCard />
        </div>
      ) : null}
    </div>
  );
}
