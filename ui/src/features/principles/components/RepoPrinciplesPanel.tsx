import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlusIcon,
  ScaleIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RepoPrincipleStatusOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  useAuditRepositoryMutation,
  useRepoPrinciplesQuery,
  useSetPrincipleAssignmentMutation,
} from "../api";
import { SeverityDot, VerdictIcon } from "./badges";

/** Violation shape written by the audit handler (stored as JSONB, typed loosely by openapi). */
interface Violation {
  file: string;
  line: number | null;
  explanation: string;
}

/**
 * The repo view's Principles tab: the principles this repository is held to, each with its
 * newest verdict, plus the ones it isn't — so the set can be narrowed down and widened back up
 * from one screen. "Run audit" enqueues one engine job per assigned enabled principle; the query
 * polls while any verdict is in flight.
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
  const { mutate: setAssignment, isPending: assigning } =
    useSetPrincipleAssignmentMutation(repositoryId);

  const assigned = statuses?.filter((s) => s.assigned) ?? [];
  const available = statuses?.filter((s) => !s.assigned) ?? [];
  const anyPending = assigned.some((s) => s.latest_check?.status === "pending");

  const change = (principleId: string, next: boolean) =>
    setAssignment(
      { principleId, assigned: next },
      {
        onSuccess: () =>
          toast.success(
            next
              ? t("principles.repo.assigned_toast")
              : t("principles.repo.unassigned_toast"),
          ),
      },
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("principles.repo.assigned_count", { count: assigned.length })}
        </p>
        <Button
          size="sm"
          disabled={auditing || anyPending || assigned.length === 0}
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
        <>
          {assigned.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {t("principles.repo.none_assigned")}
            </p>
          ) : (
            <div className="space-y-3">
              {assigned.map((s) => (
                <StatusCard
                  key={s.principle.id}
                  status={s}
                  disabled={assigning}
                  onUnassign={() => change(s.principle.id, false)}
                />
              ))}
            </div>
          )}

          {available.length > 0 ? (
            <section className="space-y-2 pt-2">
              <h3 className="text-sm font-medium">
                {t("principles.repo.available_title", {
                  count: available.length,
                })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("principles.repo.available_body")}
              </p>
              <div className="divide-y divide-border rounded-md border border-border">
                {available.map((s) => (
                  <div
                    key={s.principle.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <SeverityDot severity={s.principle.severity} />
                        <span className="truncate text-sm">
                          {s.principle.name}
                        </span>
                      </span>
                      <span className="mt-0.5 block pl-4 text-xs text-muted-foreground">
                        {t(`principles.tech.${s.principle.tech}`)}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={assigning}
                      onClick={() => change(s.principle.id, true)}
                    >
                      <PlusIcon className="size-3.5" />
                      {t("principles.repo.assign")}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatusCard({
  status,
  disabled,
  onUnassign,
}: {
  status: RepoPrincipleStatusOut;
  disabled: boolean;
  onUnassign: () => void;
}) {
  const { t } = useTranslation();
  // Collapsed by default — the tab is a scannable compliance list.
  const [open, setOpen] = useState(false);
  const check = status.latest_check;
  const verdict = check?.status ?? "never";

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start justify-between gap-2 px-5 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {open ? (
            <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <SeverityDot severity={status.principle.severity} />
              <span className="font-medium">{status.principle.name}</span>
              {status.default_assigned ? null : (
                <Badge variant="secondary" className="text-[10px]">
                  {t("principles.repo.added")}
                </Badge>
              )}
            </span>
            {/* Which tech the principle belongs to — quiet, so the name still leads the row. */}
            <span className="mt-0.5 block pl-4 text-xs text-muted-foreground">
              {t(`principles.tech.${status.principle.tech}`)}
            </span>
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          <VerdictIcon status={verdict} />
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            title={t("principles.repo.unassign")}
            onClick={onUnassign}
          >
            <XIcon className="size-3.5" />
          </Button>
        </span>
      </div>

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
