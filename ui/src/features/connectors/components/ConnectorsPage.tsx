import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnectionsQuery } from "../api";
import type { ConnectorTab } from "../tabs";
import { ConnectionsTable } from "./ConnectionsTable";
import { ConnectorCatalog } from "./ConnectorCatalog";

export function ConnectorsPage({
  tab,
  onTabChange,
}: {
  tab: ConnectorTab;
  onTabChange: (tab: ConnectorTab) => void;
}) {
  const { t } = useTranslation();
  // One query feeds both tabs: the catalog's per-connector counts and the table.
  const { data, isPending, isError, error } = useConnectionsQuery({
    page: 1,
    page_size: 100,
  });
  const connections = data?.items ?? [];

  const counts = useMemo(
    () =>
      connections.reduce<Record<string, number>>((acc, connection) => {
        acc[connection.provider] = (acc[connection.provider] ?? 0) + 1;
        return acc;
      }, {}),
    [connections],
  );

  return (
    <div className="space-y-6">
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as ConnectorTab)}
      >
        <TabsList>
          <TabsTrigger value="connectors">
            {t("connectors.tabs.connectors")}
          </TabsTrigger>
          <TabsTrigger value="connections">
            {t("connectors.tabs.connections")}
            {connections.length > 0 ? (
              <Badge variant="secondary">{connections.length}</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connectors" className="pt-2">
          <ConnectorCatalog counts={counts} />
        </TabsContent>

        <TabsContent value="connections" className="pt-2">
          <ConnectionsTable
            connections={connections}
            isPending={isPending}
            isError={isError}
            error={error}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
