import { NetworkIcon, UsersIcon, UsersRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContributionsGraphTab } from "./ContributionsGraphTab";
import { MembersListPage } from "./MembersListPage";
import { TeamsDashboardTab } from "./TeamsDashboardTab";

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
        <ContributionsGraphTab anonymize={anonymize} />
      </TabsContent>
      <TabsContent value="teams">
        <TeamsDashboardTab />
      </TabsContent>
    </Tabs>
  );
}
