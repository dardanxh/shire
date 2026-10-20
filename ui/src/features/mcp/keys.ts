/** Query-key factory for the MCP servers snapshot. */
export const mcpKeys = {
  all: ["mcp"] as const,
  servers: () => [...mcpKeys.all, "servers"] as const,
};
