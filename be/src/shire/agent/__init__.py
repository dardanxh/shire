"""Agent-facing surfaces for Hobits.

Currently: an MCP server (`mcp_server`) that exposes the per-repo context pack plus code drill-down
tools to a Claude agent, so it reasons over one precomputed layer instead of fanning out across the
REST API.
"""
