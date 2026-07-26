import { CircleCheckIcon, CircleXIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/25",
  warning:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        SEVERITY_STYLES[severity] ??
          "bg-muted text-muted-foreground border-foreground/10",
      )}
    >
      {t(`principles.severity.${severity}`, { defaultValue: severity })}
    </Badge>
  );
}

const VERDICT_STYLES: Record<string, string> = {
  upheld:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  violated: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  pending:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  error: "bg-muted text-muted-foreground border-foreground/10",
};

/** The audit outcome; `status` may also be "never" (no check yet). */
export function VerdictBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(
        VERDICT_STYLES[status] ??
          "bg-muted text-muted-foreground border-foreground/10",
        className,
      )}
    >
      {status === "pending" ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : status === "upheld" ? (
        <CircleCheckIcon className="size-3" />
      ) : status === "violated" ? (
        <CircleXIcon className="size-3" />
      ) : null}
      {t(`principles.verdict.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/** Bare verdict icon — no pill. Check = upheld, X = violated, spinner = pending. */
export function VerdictIcon({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`principles.verdict.${status}`, { defaultValue: status });
  if (status === "upheld")
    return (
      <CircleCheckIcon aria-label={label} className="size-5 text-success" />
    );
  if (status === "violated")
    return (
      <CircleXIcon aria-label={label} className="size-5 text-destructive" />
    );
  if (status === "pending")
    return (
      <Loader2Icon
        aria-label={label}
        className="size-5 animate-spin text-muted-foreground"
      />
    );
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

const SEVERITY_DOTS: Record<string, string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

/** Quiet severity signal: a small colored dot (tooltip carries the word). */
export function SeverityDot({ severity }: { severity: string }) {
  const { t } = useTranslation();
  const label = t(`principles.severity.${severity}`, {
    defaultValue: severity,
  });
  return (
    <span
      title={label}
      className={cn(
        "size-2 shrink-0 rounded-full",
        SEVERITY_DOTS[severity] ?? "bg-muted-foreground/40",
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
