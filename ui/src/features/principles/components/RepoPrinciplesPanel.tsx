import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  ScaleIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RepoPrincipleStatusOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAuditRepositoryMutation, useRepoPrinciplesQuery } from "../api";
import { SeverityBadge, VerdictBadge } from "./badges";

/** Violation shape written by the audit handler (stored as JSONB, typed loosely by openapi). */
interface Violation {
  file: string;
  line: number | null;
  explanation: string;
}

/**
 * The repo view's Principles tab: each applicable principle with its newest verdict.
 * "Run audit" enqueues one engine job per enabled principle; the query polls while
 * any verdict is in flight.
 */
export function RepoPrinciplesPanel({
  repositoryId,
}: {
  repositoryId: string;
}) {
  const { t } = useTranslation();
  const { data: statuses } = useRepoPrinciplesQuery(repositoryId);
  const { mutate: audit, isPending: auditing } =
    useAuditRepositoryMutation(repositoryId);

  const anyPending = statuses?.some(
    (s) => s.latest_check?.status === "pending",
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={auditing || anyPending}
          onClick={() =>
            audit(undefined, {
              onSuccess: () => toast.success(t("principles.repo.audit_queued")),
            })
          }
        >
          {auditing || anyPending ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <ScaleIcon className="size-3.5" />
          )}
          {anyPending
            ? t("principles.repo.auditing")
            : t("principles.repo.run_audit")}
        </Button>
      </div>

      {(statuses?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ScaleIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("principles.repo.empty_title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("principles.repo.empty_body")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {statuses?.map((s) => (
            <StatusCard key={s.principle.id} status={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusCard({ status }: { status: RepoPrincipleStatusOut }) {
  const { t } = useTranslation();
  // Collapsed by default — the tab is a scannable compliance list.
  const [open, setOpen] = useState(false);
  const check = status.latest_check;
  const verdict = check?.status ?? "never";

  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left"
      >
        <span className="inline-flex min-w-0 items-start gap-2">
          {open ? (
            <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium">{status.principle.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <SeverityBadge severity={status.principle.severity} />
          <VerdictBadge status={verdict} />
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-5 py-4">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {status.principle.statement}
          </p>

          {check == null ? (
            <p className="text-sm text-muted-foreground">
              {t("principles.repo.never_body")}
            </p>
          ) : check.status === "pending" ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              {t("principles.repo.checking")}
            </p>
          ) : check.status === "error" ? (
            <p className="text-sm text-destructive">
              {check.error ?? t("principles.repo.error")}
            </p>
          ) : (
            <>
              {check.summary ? (
                <p className="text-sm leading-relaxed">{check.summary}</p>
              ) : null}
              {check.violations.length > 0 ? (
                <ul className="space-y-2">
                  {(check.violations as unknown as Violation[]).map((v, i) => (
                    <li
                      key={`${v.file}-${i}`}
                      className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm"
                    >
                      <p className="font-mono text-xs">
                        {v.file}
                        {v.line != null ? `:${v.line}` : ""}
                      </p>
                      {v.explanation ? (
                        <p className="mt-1 text-muted-foreground">
                          {v.explanation}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("principles.repo.checked_at", {
                  when: formatDateTime(check.finished_at ?? check.created_at),
                })}
                {check.branch ? ` · ${check.branch}` : ""}
              </p>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
