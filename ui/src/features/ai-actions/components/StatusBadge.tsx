import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ClockIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import type { AiActionStatus } from "../api";

const VARIANT = {
  idle: "outline",
  pending: "secondary",
  running: "accent",
  succeeded: "success",
  failed: "destructive",
} as const;

const ICON = {
  idle: CircleDashedIcon,
  pending: ClockIcon,
  running: Loader2Icon,
  succeeded: CheckCircle2Icon,
  failed: XCircleIcon,
} as const;

/** The latest run's state: never run, queued, running, or how it settled. */
export function StatusBadge({ status }: { status: AiActionStatus }) {
  const { t } = useTranslation();
  const Icon = ICON[status];
  return (
    <Badge variant={VARIANT[status]}>
      <Icon className={status === "running" ? "animate-spin" : undefined} />
      {t(`ai_actions.status.${status}`)}
    </Badge>
  );
}
