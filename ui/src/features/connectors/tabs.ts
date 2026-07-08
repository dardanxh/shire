/** Tab values for the connectors page. Dependency-free so route files can import
 * it for search-param validation without pulling in the heavy feature bundle. */
export const CONNECTOR_TAB_VALUES = ["connectors", "connections"] as const;
export type ConnectorTab = (typeof CONNECTOR_TAB_VALUES)[number];
