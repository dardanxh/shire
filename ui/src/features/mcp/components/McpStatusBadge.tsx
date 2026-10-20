import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { McpStatus } from "../api";

const VARIANT = {
  connected: "success",
  needs_auth: "warning",
  failed: "destructive",
  unknown: "outline",
} as const satisfies Record<McpStatus, string>;

export function McpStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const known = (status in VARIANT ? status : "unknown") as McpStatus;
  return <Badge variant={VARIANT[known]}>{t(`mcp.status.${known}`)}</Badge>;
}
