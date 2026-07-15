import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { HobitMultiSelect } from "@/components/shared/HobitMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHobitsQuery } from "@/features/hobits/api";
import {
  useBranchNamesQuery,
  useRepositoriesQuery,
} from "@/features/repositories/api";
import { useCreateMergeReviewMutation } from "../api";

const STEPS = ["repository", "branches", "hobits", "confirm"] as const;
const MR_REVIEWER_CATEGORY = "MR Reviewer";

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * The MR-review creation wizard: repository → branch pair → reviewer hobits → GO.
 * POST returns fast (footprint only), so there is no long lock screen — the
 * detail page opens with the footprint painted and the AI sections polling in.
 */
export function CreateMergeReviewDialog({
  defaultRepositoryId,
  trigger,
}: {
  defaultRepositoryId?: string;
  trigger?: ReactElement;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [repositoryId, setRepositoryId] = useState(defaultRepositoryId ?? "");
  const [title, setTitle] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);
  const [hobits, setHobits] = useState<Set<string>>(new Set());

  const { data: repositories } = useRepositoriesQuery({
    page: 1,
    page_size: 100,
  });
  const { data: branchNames } = useBranchNamesQuery(repositoryId);
  const { data: hobitCatalog } = useHobitsQuery();
  const { mutate: createReview, isPending } = useCreateMergeReviewMutation();

  const readyRepos = useMemo(
    () => (repositories?.items ?? []).filter((r) => r.status === "ready"),
    [repositories],
  );

  // MR-reviewer hobits float to the top; everything else stays selectable.
  const hobitOptions = useMemo(
    () =>
      (hobitCatalog ?? [])
        .filter((h) => h.category !== "Foundational")
        .sort((a, b) =>
          a.category === b.category
            ? a.name.localeCompare(b.name)
            : a.category === MR_REVIEWER_CATEGORY
              ? -1
              : b.category === MR_REVIEWER_CATEGORY
                ? 1
                : 0,
        )
        .map((h) => ({
          slug: h.slug,
          name:
            h.category === MR_REVIEWER_CATEGORY
              ? `${h.name} — ${t("merge_reviews.create.mr_reviewer_badge")}`
              : h.name,
          category: h.category,
          tags: h.tags,
        })),
    [hobitCatalog, t],
  );

  // The target defaults to the repo's default branch without an effect: an
  // explicit pick wins, otherwise the loaded default applies.
  const effectiveTarget = targetBranch || branchNames?.default_branch || "";

  const reset = () => {
    setStep(0);
    setRepositoryId(defaultRepositoryId ?? "");
    setTitle("");
    setSourceBranch("");
    setTargetBranch("");
    setStepError(null);
    setHobits(new Set());
  };

  const next = () => {
    if (step === 0 && !repositoryId) {
      setStepError(t("merge_reviews.create.repository_required"));
      return;
    }
    if (step === 1) {
      if (!sourceBranch || !effectiveTarget) {
        setStepError(t("merge_reviews.create.branches_required"));
        return;
      }
      if (sourceBranch === effectiveTarget) {
        setStepError(t("merge_reviews.create.same_branch_error"));
        return;
      }
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = () => {
    createReview(
      {
        repository_id: repositoryId,
        source_branch: sourceBranch,
        target_branch: effectiveTarget,
        title: title.trim() || null,
        hobit_slugs: [...hobits],
      },
      {
        onSuccess: (review) => {
          toast.success(t("merge_reviews.create.toast_created"));
          setOpen(false);
          reset();
          navigate({ to: "/merge-reviews/$id", params: { id: review.id } });
        },
      },
    );
  };

  const repoSlug = readyRepos.find((r) => r.id === repositoryId)?.slug;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isPending) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <PlusIcon className="size-4" />
              {t("merge_reviews.create.trigger")}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("merge_reviews.create.title")}</DialogTitle>
          <DialogDescription>
            {t(`merge_reviews.create.step_${STEPS[step]}_desc`)}
          </DialogDescription>
        </DialogHeader>

        <StepDots steps={STEPS} active={step} />

        <div className="min-h-[16rem] py-2">
          {step === 0 ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("merge_reviews.create.repository")}</Label>
                <Select
                  value={repositoryId}
                  onValueChange={(v) => {
                    setRepositoryId(v ?? "");
                    setSourceBranch("");
                    setTargetBranch("");
                    setStepError(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(value) =>
                        value
                          ? (readyRepos.find((r) => r.id === value)?.slug ??
                            String(value))
                          : t("merge_reviews.create.repository_placeholder")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {readyRepos.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mr-title">
                  {t("merge_reviews.create.title_label")}
                </Label>
                <Input
                  id="mr-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("merge_reviews.create.title_placeholder")}
                />
              </div>
            </div>
          ) : step === 1 ? (
            <div className="space-y-4">
              <BranchSelect
                label={t("merge_reviews.create.source")}
                placeholder={t("merge_reviews.create.source_placeholder")}
                value={sourceBranch}
                branches={branchNames?.branches ?? []}
                onChange={(v) => {
                  setSourceBranch(v);
                  setStepError(null);
                }}
                emptyLabel={t("merge_reviews.create.branches_empty")}
              />
              <BranchSelect
                label={t("merge_reviews.create.target")}
                placeholder={t("merge_reviews.create.target_placeholder")}
                value={effectiveTarget}
                branches={branchNames?.branches ?? []}
                onChange={(v) => {
                  setTargetBranch(v);
                  setStepError(null);
                }}
                emptyLabel={t("merge_reviews.create.branches_empty")}
              />
            </div>
          ) : step === 2 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("merge_reviews.create.hobits_hint")}
              </p>
              <HobitMultiSelect
                hobits={hobitOptions}
                selected={hobits}
                onToggle={(v) => setHobits((s) => toggle(s, v))}
              />
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              <Summary
                label={t("merge_reviews.create.summary_repository")}
                value={repoSlug ?? repositoryId}
                mono
              />
              <Summary
                label={t("merge_reviews.create.summary_branches")}
                value={
                  <span className="font-mono text-xs">
                    {sourceBranch} → {effectiveTarget}
                  </span>
                }
              />
              <Summary
                label={t("merge_reviews.create.summary_reviewers")}
                value={
                  hobits.size ? (
                    <div className="flex flex-wrap gap-1">
                      {[...hobits].map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    t("merge_reviews.create.summary_no_reviewers")
                  )
                }
              />
              {hobits.size === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("merge_reviews.create.no_hobits")}
                </p>
              ) : null}
            </dl>
          )}
          {stepError ? (
            <p className="mt-3 text-xs text-destructive">{stepError}</p>
          ) : null}
        </div>

        <DialogFooter>
          {step > 0 ? (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={isPending}
            >
              {t("merge_reviews.create.back")}
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>{t("merge_reviews.create.next")}</Button>
          ) : (
            <Button onClick={finish} disabled={isPending}>
              {t("merge_reviews.create.go")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchSelect({
  label,
  placeholder,
  value,
  branches,
  onChange,
  emptyLabel,
}: {
  label: string;
  placeholder: string;
  value: string;
  branches: string[];
  onChange: (value: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger>
          <SelectValue>
            {(v) => (
              <span className="font-mono text-xs">
                {v ? String(v) : placeholder}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {branches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            branches.map((name) => (
              <SelectItem key={name} value={name}>
                <span className="font-mono text-xs">{name}</span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function StepDots({
  steps,
  active,
}: {
  steps: readonly string[];
  active: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((name, i) => (
        <span
          key={name}
          className={`h-1.5 flex-1 rounded-full ${
            i <= active ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function Summary({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "break-all font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}
