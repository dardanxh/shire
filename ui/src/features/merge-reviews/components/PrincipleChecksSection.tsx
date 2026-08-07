import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  ScaleIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Highlightable } from "@/components/shared/Highlightable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useRepoPrinciplesQuery } from "@/features/principles/api";
import {
  SeverityDot,
  VerdictIcon,
} from "@/features/principles/components/badges";
import type { MergeReviewDetailOut, MrPrincipleCheckOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useRunPrincipleChecksMutation } from "../api";

/** Violation shape written by the check handler (JSONB, so openapi types it loosely). */
interface Violation {
  file: string;
  line: number | null;
  explanation: string;
}

/**
 * Layer 6 — the repository's own principles, asked of *this* MR's changes.
 *
 * Never runs on its own: the analysis pipeline doesn't touch it, and nothing here fires until
 * the button is pressed. The pick list is the set the repository is currently held to (the same
 * reach the repo's Principles tab shows), so this screen and that one can never disagree about
 * which principles apply.
 *
 * The verdicts answer a narrower question than the repo audit does — "does this change break
 * the rule", not "does this codebase comply" — so a clean MR into a non-compliant repo reads
 * as clean here.
 */
export function PrincipleChecksSection({
  review,
}: {
  review: MergeReviewDetailOut;
}) {
  const { t } = useTranslation();
  const { data: statuses } = useRepoPrinciplesQuery(review.repository_id);
  const { mutate: runChecks, isPending } = useRunPrincipleChecksMutation(
    review.id,
  );

  const applicable = (statuses ?? []).filter(
    (s) => s.assigned && s.principle.enabled,
  );
  const checksByPrinciple = new Map(
    review.principle_checks.map((c) => [c.principle_id, c]),
  );
  const running = review.principle_checks.some((c) => c.status === "pending");

  // `undefined` = "not touched yet" → every applicable principle. Deriving the default rather
  // than seeding state means principles assigned after this page loaded are included too.
  const [picked, setPicked] = useState<ReadonlySet<string>>();
  const selected = picked ?? new Set(applicable.map((s) => s.principle.id));

  const toggle = (id: string) =>
    setPicked(() => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = () =>
    runChecks(
      { principle_ids: [...selected] },
      { onSuccess: () => toast.success(t("merge_reviews.principles.queued")) },
    );

  // Nothing to offer and nothing to show: stay out of the page entirely.
  if (applicable.length === 0 && review.principle_checks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("merge_reviews.principles.title")}
          </h2>
          {running ? (
            <Badge variant="secondary" className="animate-pulse">
              {t("merge_reviews.principles.checking")}
            </Badge>
          ) : null}
        </div>
        <Button
          size="sm"
          onClick={run}
          disabled={isPending || running || selected.size === 0}
        >
          {isPending || running ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <ScaleIcon className="size-3.5" />
          )}
          {t("merge_reviews.principles.run", { count: selected.size })}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("merge_reviews.principles.intro")}
      </p>

      {applicable.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("merge_reviews.principles.none_assigned")}
        </p>
      ) : (
        <div className="space-y-2">
          {applicable.map((status) => (
            <PrincipleRow
              key={status.principle.id}
              name={status.principle.name}
              severity={status.principle.severity}
              statement={status.principle.statement}
              check={checksByPrinciple.get(status.principle.id)}
              selected={selected.has(status.principle.id)}
              onToggle={() => toggle(status.principle.id)}
            />
          ))}
        </div>
      )}

      {/* A verdict whose principle is no longer assigned to the repo still happened, and
          hiding it would look like the check was lost. */}
      {review.principle_checks
        .filter(
          (c) => !applicable.some((s) => s.principle.id === c.principle_id),
        )
        .map((check) => (
          <PrincipleRow
            key={check.principle_id}
            name={check.principle_name}
            severity={check.severity}
            statement={check.statement}
            check={check}
            unassigned
          />
        ))}
    </div>
  );
}

function PrincipleRow({
  name,
  severity,
  statement,
  check,
  selected,
  onToggle,
  unassigned,
}: {
  name: string;
  severity: string;
  statement: string;
  check: MrPrincipleCheckOut | undefined;
  selected?: boolean;
  onToggle?: () => void;
  unassigned?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const verdict = check?.status ?? "never";
  const checkboxId = `mr-principle-${name.replace(/\s+/g, "-")}`;

  return (
    <Card className="gap-0 p-0">
      <div className="flex items-start gap-2 px-4 py-3">
        {onToggle ? (
          <Checkbox
            id={checkboxId}
            checked={selected}
            onCheckedChange={onToggle}
            className="mt-0.5"
            aria-label={t("merge_reviews.principles.include", { name })}
          />
        ) : null}
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
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <SeverityDot severity={severity} />
              {/* Not a <label>: the row toggles the detail panel, the checkbox picks it for a
                  run. Pointing the label at the checkbox would make the whole row do both. */}
              <span className="font-medium">{name}</span>
              {unassigned ? (
                <Badge variant="secondary" className="text-[10px]">
                  {t("merge_reviews.principles.unassigned")}
                </Badge>
              ) : null}
            </span>
            {check?.status === "violated" && check.summary ? (
              <span className="mt-0.5 block pl-4 text-xs text-muted-foreground">
                {check.summary}
              </span>
            ) : null}
          </span>
        </button>
        <span className="shrink-0 pt-0.5">
          <VerdictIcon status={verdict} />
        </span>
      </div>

      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {statement}
          </p>

          {check == null ? (
            <p className="text-sm text-muted-foreground">
              {t("merge_reviews.principles.never_body")}
            </p>
          ) : check.status === "pending" ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              {t("merge_reviews.principles.checking_body")}
            </p>
          ) : check.status === "error" ? (
            <p className="text-sm text-destructive">
              {check.error ?? t("merge_reviews.principles.error")}
            </p>
          ) : (
            <>
              {check.summary ? (
                // Agent-written prose, so highlightable like every other verdict.
                <Highlightable>
                  <p className="text-sm leading-relaxed">{check.summary}</p>
                </Highlightable>
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
                {t("merge_reviews.principles.checked_at", {
                  when: formatDateTime(check.finished_at),
                })}
              </p>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
