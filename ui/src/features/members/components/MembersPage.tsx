import { NetworkIcon, UsersIcon, UsersRoundIcon } from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersListPage } from "./MembersListPage";
import { TeamsDashboardTab } from "./TeamsDashboardTab";

// The graph tab pulls in reagraph + three.js (heavy, WebGL) — load it only when opened.
const ContributionsGraphTab = lazy(() =>
  import("./ContributionsGraphTab").then((m) => ({
    default: m.ContributionsGraphTab,
  })),
);

export type MembersTab = "members" | "graph" | "teams";

interface Props {
  tab: MembersTab;
  anonymize: boolean;
  onTabChange: (tab: MembersTab) => void;
  onAnonymizeChange: (value: boolean) => void;
}

export function MembersPage({
  tab,
  anonymize,
  onTabChange,
  onAnonymizeChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange((value ?? "members") as MembersTab)}
    >
      <TabsList>
        <TabsTrigger value="members">
          <UsersIcon />
          {t("members.tabs.members")}
        </TabsTrigger>
        <TabsTrigger value="graph">
          <NetworkIcon />
          {t("members.tabs.graph")}
        </TabsTrigger>
        <TabsTrigger value="teams">
          <UsersRoundIcon />
          {t("members.tabs.teams")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="members">
        <MembersListPage
          anonymize={anonymize}
          onAnonymizeChange={onAnonymizeChange}
        />
      </TabsContent>
      <TabsContent value="graph">
        <Suspense
          fallback={
            <Card className="flex h-[620px] items-center justify-center text-sm text-muted-foreground">
              {t("members.graph.loading")}
            </Card>
          }
        >
          <ContributionsGraphTab anonymize={anonymize} />
        </Suspense>
      </TabsContent>
      <TabsContent value="teams">
        <TeamsDashboardTab />
      </TabsContent>
    </Tabs>
  );
}
