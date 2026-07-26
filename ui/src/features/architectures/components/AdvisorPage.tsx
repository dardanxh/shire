import { getRouteApi, Link } from "@tanstack/react-router";
import { RotateCcwIcon, ScaleIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type Blueprint, useBlueprintsQuery } from "../api";
import { USE_CASE_SLUGS } from "../use-cases";

const route = getRouteApi("/architectures/advisor");

const STEP_KEYS = ["goal", "freshness", "team", "scale", "governance"] as const;
type StepKey = (typeof STEP_KEYS)[number];
type Answers = Record<StepKey, string[]>;

const EMPTY_ANSWERS: Answers = {
  goal: [],
  freshness: [],
  team: [],
  scale: [],
  governance: [],
};

type Scored = { blueprint: Blueprint; score: number; reasons: string[] };

/**
 * Client-side ranking over blueprint metadata (use-case tags, complexity, slug)
 * — deliberately simple and explainable: every point comes with a reason.
 * Multi-select answers apply each selected option's rule additively.
 */
function rank(
  blueprints: Blueprint[],
  answers: Answers,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Scored[] {
  return blueprints
    .filter((b) => b.source === "seed")
    .map((blueprint) => {
      let score = 0;
      const reasons: string[] = [];
      const add = (points: number, reason?: string) => {
        score += points;
        if (points > 0 && reason && !reasons.includes(reason))
          reasons.push(reason);
      };
      const tags = blueprint.use_cases;
      const complexity = blueprint.complexity;

      for (const goal of answers.goal) {
        if (tags.includes(goal)) {
          add(
            4,
            t("blueprints.advisor.reason_goal", {
              goal: t(`blueprints.use_case_tags.${goal}`),
            }),
          );
        }
      }
      for (const freshness of answers.freshness) {
        if (freshness === "subsecond") {
          if (tags.includes("realtime"))
            add(3, t("blueprints.advisor.reason_realtime"));
          else add(-2);
        } else if (freshness === "minutes") {
          if (tags.includes("realtime") || tags.includes("operational"))
            add(2, t("blueprints.advisor.reason_fresh"));
        } else if (freshness === "batch") {
          if (tags.includes("reporting"))
            add(2, t("blueprints.advisor.reason_batch"));
        }
      }
      for (const team of answers.team) {
        if (team === "lean") {
          if (complexity === "low") add(3, t("blueprints.advisor.reason_lean"));
          else if (complexity === "high") add(-3);
        } else if (team === "solid") {
          if (complexity !== "high")
            add(1, t("blueprints.advisor.reason_solid"));
        } else if (team === "platform") {
          if (complexity === "high")
            add(2, t("blueprints.advisor.reason_platform"));
        }
      }
      for (const scale of answers.scale) {
        if (scale === "small") {
          if (blueprint.slug === "small-data-duckdb-stack")
            add(4, t("blueprints.advisor.reason_small"));
          if (complexity === "high") add(-2);
        } else if (scale === "large") {
          if (blueprint.slug === "small-data-duckdb-stack") add(-4);
          if (complexity !== "low")
            add(1, t("blueprints.advisor.reason_large"));
        }
      }
      if (
        answers.governance.includes("strict") &&
        tags.includes("compliance")
      ) {
        add(3, t("blueprints.advisor.reason_compliance"));
      }
      return { blueprint, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

/** One question step — multi-select toggle chips. */
function OptionGrid({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onToggle(option.value)}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            selected.includes(option.value)
              ? "border-primary bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** All five multi-select questions stacked vertically; results at the bottom. */
export function AdvisorPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const { data: blueprints, isPending } = useBlueprintsQuery({});
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);

  if (isPending) return <Skeleton className="h-[70vh] w-full" />;

  const q = (key: string) => t(`blueprints.advisor.${key}`);
  const toggle = (key: StepKey, value: string) =>
    setAnswers((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((x) => x !== value)
        : [...prev[key], value],
    }));

  const STEP_OPTIONS: Record<StepKey, { value: string; label: string }[]> = {
    goal: USE_CASE_SLUGS.map((slug) => ({
      value: slug,
      label: t(`blueprints.use_case_tags.${slug}`),
    })),
    freshness: [
      { value: "batch", label: q("freshness_batch") },
      { value: "minutes", label: q("freshness_minutes") },
      { value: "subsecond", label: q("freshness_subsecond") },
    ],
    team: [
      { value: "lean", label: q("team_lean") },
      { value: "solid", label: q("team_solid") },
      { value: "platform", label: q("team_platform") },
    ],
    scale: [
      { value: "small", label: q("scale_small") },
      { value: "medium", label: q("scale_medium") },
      { value: "large", label: q("scale_large") },
    ],
    governance: [
      { value: "normal", label: q("governance_normal") },
      { value: "strict", label: q("governance_strict") },
    ],
  };

  const answered = STEP_KEYS.filter((key) => answers[key].length > 0).length;
  const complete = answered === STEP_KEYS.length;
  const top = complete ? rank(blueprints ?? [], answers, t).slice(0, 3) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {STEP_KEYS.map((key) => (
        <div
          key={key}
          className="flex flex-col gap-4 rounded-xl border bg-card p-5"
        >
          <h2 className="font-medium">
            {q(`q_${key}`)}
            <span aria-hidden className="ml-0.5 text-destructive">
              *
            </span>
          </h2>
          <OptionGrid
            options={STEP_OPTIONS[key]}
            selected={answers[key]}
            onToggle={(value) => toggle(key, value)}
          />
        </div>
      ))}

      {complete ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-medium">
              <SparklesIcon className="size-4 text-primary" />
              {q("results_title")}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAnswers(EMPTY_ANSWERS)}
              >
                <RotateCcwIcon />
                {q("start_over")}
              </Button>
              {top.length >= 2 && (
                <Button
                  size="sm"
                  onClick={() =>
                    navigate({
                      to: "/architectures/compare",
                      search: { ids: top.map(({ blueprint }) => blueprint.id) },
                    })
                  }
                >
                  <ScaleIcon />
                  {q("compare_top")}
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {top.map(({ blueprint, score, reasons }, index) => (
              <Link
                key={blueprint.id}
                to="/architectures/$id"
                params={{ id: blueprint.id }}
                className="flex flex-col gap-2 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">
                    {index + 1}. {blueprint.name}
                  </span>
                  <Badge variant="secondary">
                    {q("score")} {score}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {blueprint.use_case}
                </p>
                <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted-foreground">
                  {reasons.slice(0, 4).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {q("answer_all")}
        </p>
      )}
    </div>
  );
}
