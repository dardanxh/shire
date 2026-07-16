import { Link } from "@tanstack/react-router";
import {
  ExternalLinkIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ROADMAP_EFFORTS,
  type RoadmapDetailOut,
  type RoadmapItemStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useAddDependencyMutation,
  useExecuteItemMutation,
  useRemoveDependencyMutation,
  useUpdateRoadmapItemMutation,
} from "../api";
import { EffortBadge, ItemStatusBadge, LabelBadge } from "./chips";

/** Mirrors the backend's ITEM_TRANSITIONS so the select only offers legal moves. */
const TRANSITIONS: Record<string, RoadmapItemStatus[]> = {
  todo: ["in_progress", "done"],
  in_progress: ["todo", "done"],
  done: ["todo", "in_progress"],
};

const BOOL = { true: "true", false: "false" } as const;

/**
 * The item detail, opened by the `item` URL search param. Status / priority /
 * effort selects PATCH immediately (single-field edits, no form). Blocked-by
 * chips swap the dialog to the blocking item.
 */
export function ItemDialog({
  roadmap,
  itemId,
  readOnly,
  onOpenItem,
  onClose,
}: {
  roadmap: RoadmapDetailOut;
  itemId: string | null;
  readOnly: boolean;
  onOpenItem: (itemId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const item = roadmap.items.find((i) => i.id === itemId);
  const [addingDep, setAddingDep] = useState(false);
  const { mutate: updateItem } = useUpdateRoadmapItemMutation(roadmap.id);
  const { mutate: addDependency } = useAddDependencyMutation(roadmap.id);
  const { mutate: removeDependency } = useRemoveDependencyMutation(roadmap.id);

  const byId = useMemo(
    () => new Map(roadmap.items.map((i) => [i.id, i])),
    [roadmap.items],
  );
  const repo = item?.repository_id
    ? roadmap.repositories.find((r) => r.id === item.repository_id)
    : undefined;
  const milestone = item?.milestone_id
    ? roadmap.milestones.find((m) => m.id === item.milestone_id)
    : undefined;

  const dependencyOptions = item
    ? roadmap.items.filter(
        (candidate) =>
          candidate.id !== item.id && !item.depends_on.includes(candidate.id),
      )
    : [];

  return (
    <Dialog
      open={item !== undefined}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle className="leading-snug">{item.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                <LabelBadge label={item.label} />
                <EffortBadge effort={item.effort} />
                <ItemStatusBadge status={item.status} />
                {repo ? (
                  <Link
                    to="/repositories/$id"
                    params={{ id: repo.id }}
                    search={{ tab: "overview", tool: undefined }}
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {repo.slug}
                  </Link>
                ) : (
                  <span className="text-xs">
                    {t("roadmaps.items.portfolio_wide")}
                  </span>
                )}
                {milestone ? (
                  <span className="text-xs">· {milestone.title}</span>
                ) : null}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("roadmaps.item.status")}>
                <Select
                  value={item.status}
                  onValueChange={(next) =>
                    updateItem({ itemId: item.id, body: { status: next } })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={item.status}>
                      {t(`roadmaps.item_status.${item.status}`)}
                    </SelectItem>
                    {(TRANSITIONS[item.status] ?? []).map((next) => (
                      <SelectItem key={next} value={next}>
                        {t(`roadmaps.item_status.${next}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("roadmaps.item.urgent")}>
                <Select
                  value={item.urgent ? BOOL.true : BOOL.false}
                  onValueChange={(next) =>
                    updateItem({
                      itemId: item.id,
                      body: { urgent: next === BOOL.true },
                    })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BOOL.true}>
                      {t("roadmaps.item.yes")}
                    </SelectItem>
                    <SelectItem value={BOOL.false}>
                      {t("roadmaps.item.no")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("roadmaps.item.important")}>
                <Select
                  value={item.important ? BOOL.true : BOOL.false}
                  onValueChange={(next) =>
                    updateItem({
                      itemId: item.id,
                      body: { important: next === BOOL.true },
                    })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BOOL.true}>
                      {t("roadmaps.item.yes")}
                    </SelectItem>
                    <SelectItem value={BOOL.false}>
                      {t("roadmaps.item.no")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("roadmaps.item.effort")}>
                <Select
                  value={item.effort ?? ""}
                  onValueChange={(next) =>
                    updateItem({ itemId: item.id, body: { effort: next } })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={t("roadmaps.item.effort_unset")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {ROADMAP_EFFORTS.map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {effort}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {item.description ? (
              <Section label={t("roadmaps.item.description")}>
                <p className="whitespace-pre-wrap text-sm">
                  {item.description}
                </p>
              </Section>
            ) : null}

            {item.rationale ? (
              <Section label={t("roadmaps.item.rationale")}>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.rationale}
                </p>
              </Section>
            ) : null}

            <Section label={t("roadmaps.item.blocked_by")}>
              <div className="flex flex-wrap items-center gap-1.5">
                {item.depends_on.map((depId) => {
                  const dep = byId.get(depId);
                  if (!dep) return null;
                  const resolved = dep.status === "done";
                  return (
                    <span
                      key={depId}
                      className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs"
                    >
                      <span
                        className={
                          resolved
                            ? "size-1.5 rounded-full bg-emerald-500"
                            : "size-1.5 rounded-full bg-amber-500"
                        }
                      />
                      <button
                        type="button"
                        className="max-w-56 truncate hover:underline"
                        onClick={() => onOpenItem(depId)}
                      >
                        {dep.title}
                      </button>
                      {readOnly ? null : (
                        <button
                          type="button"
                          aria-label={t("roadmaps.item.remove_dependency")}
                          onClick={() =>
                            removeDependency({
                              itemId: item.id,
                              dependsOnItemId: depId,
                            })
                          }
                          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <XIcon className="size-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
                {item.depends_on.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t("roadmaps.item.no_dependencies")}
                  </span>
                ) : null}
              </div>
              {readOnly ? null : addingDep ? (
                <Select
                  onValueChange={(depId) => {
                    setAddingDep(false);
                    addDependency({
                      itemId: item.id,
                      dependsOnItemId: String(depId),
                    });
                  }}
                >
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue
                      placeholder={t("roadmaps.item.pick_dependency")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {dependencyOptions.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setAddingDep(true)}
                  disabled={dependencyOptions.length === 0}
                >
                  <PlusIcon className="size-3.5" />
                  {t("roadmaps.item.add_dependency")}
                </Button>
              )}
            </Section>

            {item.repository_id ? (
              <Section label={t("roadmaps.item.execution")}>
                <ExecutionSection
                  roadmap={roadmap}
                  item={item}
                  isBlocked={item.depends_on.some((depId) => {
                    const dep = byId.get(depId);
                    return dep !== undefined && dep.status !== "done";
                  })}
                  readOnly={readOnly}
                />
              </Section>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The "Implement with AI" flow: dispatch → engine job in a disposable worktree
 * → branch pushed → PR opened. States: idle / inline confirm / running (with a
 * job link — survives reloads because the execution rides on the item) /
 * PR open|merged|closed / failed with retry.
 */
function ExecutionSection({
  roadmap,
  item,
  isBlocked,
  readOnly,
}: {
  roadmap: RoadmapDetailOut;
  item: RoadmapDetailOut["items"][number];
  isBlocked: boolean;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const { mutate: executeItem, isPending: isDispatching } =
    useExecuteItemMutation(roadmap.id);

  const execution = item.execution;

  if (execution?.status === "pending") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <Loader2Icon className="size-4 animate-spin text-primary" />
        <span>{t("roadmaps.item.executing")}</span>
        {execution.job_id ? (
          <Link
            to="/jobs/$id"
            params={{ id: execution.job_id }}
            className="ml-auto text-xs text-primary hover:underline"
          >
            {t("roadmaps.generation.view_job")}
          </Link>
        ) : null}
      </div>
    );
  }

  const dispatchable =
    !readOnly && (item.status === "todo" || item.status === "in_progress");

  return (
    <div className="space-y-2">
      {execution?.pr_url ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={execution.pr_url}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ExternalLinkIcon className="size-3.5" />
            {t("roadmaps.item.view_pr", { number: execution.pr_number })}
          </a>
          <PrStateBadge state={execution.pr_state} />
          <span className="text-xs text-muted-foreground">
            {execution.total_cost_usd != null
              ? t("roadmaps.item.execution_cost", {
                  cost: execution.total_cost_usd.toFixed(2),
                })
              : null}
          </span>
        </div>
      ) : null}

      {execution?.status === "failed" ? (
        <p className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          {execution.error ?? t("roadmaps.item.execution_failed")}
        </p>
      ) : null}

      {dispatchable &&
      (!execution?.pr_url || execution.pr_state === "closed") ? (
        confirming ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm">{t("roadmaps.item.execute_confirm")}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isDispatching}
                onClick={() => {
                  setConfirming(false);
                  executeItem(item.id);
                }}
              >
                {t("roadmaps.item.execute_go")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                {t("common.actions.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Button
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={isBlocked || isDispatching}
              title={isBlocked ? t("roadmaps.item.blocked_hint") : undefined}
            >
              <SparklesIcon className="size-3.5" />
              {execution?.pr_state === "closed"
                ? t("roadmaps.item.execute_again")
                : t("roadmaps.item.execute")}
            </Button>
            {isBlocked ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <LockIcon className="size-3 shrink-0" />
                {t("roadmaps.item.blocked_explainer")}
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {!dispatchable && !execution && !readOnly ? (
        <p className="text-xs text-muted-foreground">
          {t("roadmaps.item.execute_status_hint")}
        </p>
      ) : null}
    </div>
  );
}

function PrStateBadge({ state }: { state: string | null | undefined }) {
  const { t } = useTranslation();
  if (!state) return null;
  const styles: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    merged:
      "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25",
    closed: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  };
  return (
    <Badge
      variant="outline"
      className={styles[state] ?? "bg-muted text-muted-foreground"}
    >
      {t(`roadmaps.item.pr_${state}`, { defaultValue: state })}
    </Badge>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
