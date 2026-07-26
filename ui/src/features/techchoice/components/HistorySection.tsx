import { getRouteApi } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type FlatCategory,
  flattenCategories,
  type Technology,
  useTechnologyCategoriesQuery,
  useTechnologyCorpusQuery,
} from "@/features/technologies";
import { formatDateTime } from "@/lib/format";
import {
  type TechDecisionOut,
  useDeleteTechDecisionMutation,
  useTechDecisionsQuery,
} from "../api";
import {
  parseSavedInputs,
  searchToConstraints,
  searchToWeights,
  type TechchoiceSearch,
} from "../schemas";
import { scoreCandidates } from "../score";

const route = getRouteApi("/tech-chooser");

/** Saved decisions, newest first, with summary chips recomputed client-side. */
export function HistorySection() {
  const { t } = useTranslation();
  const { data: decisions, isPending } = useTechDecisionsQuery();
  const { data: techs } = useTechnologyCorpusQuery();
  const { data: categoryTree } = useTechnologyCategoriesQuery();
  const categories = useMemo(
    () => flattenCategories(categoryTree),
    [categoryTree],
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const sorted = [...(decisions ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("techchoice.history.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((decision) => (
        <HistoryRow
          key={decision.id}
          decision={decision}
          techs={techs}
          categories={categories}
        />
      ))}
    </div>
  );
}

function HistoryRow({
  decision,
  techs,
  categories,
}: {
  decision: TechDecisionOut;
  techs: Technology[] | undefined;
  categories: FlatCategory[];
}) {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const { mutate: deleteDecision, isPending: isDeleting } =
    useDeleteTechDecisionMutation();

  // Recompute summary chips from the stored inputs; the backend only persists
  // inputs. Malformed payloads degrade to "no chips" not a crash.
  let inputs: TechchoiceSearch | null = null;
  let topName: string | null = null;
  try {
    inputs = parseSavedInputs(decision.inputs);
    const categorySlug = inputs.category;
    const category = categorySlug
      ? categories.find((c) => c.slug === categorySlug)
      : undefined;
    if (techs && category) {
      const { ranked } = scoreCandidates(
        techs,
        category.id,
        searchToWeights(inputs),
        searchToConstraints(inputs),
      );
      topName = ranked[0]?.tech.name ?? null;
    }
  } catch {
    // Leave chips empty; the row still renders name/date/actions.
  }

  const constraintCount = inputs
    ? [
        inputs.c_deployment,
        inputs.c_max_cost_tier,
        inputs.c_min_maturity,
      ].filter(Boolean).length + (inputs.c_oss_only === 1 ? 1 : 0)
    : 0;

  const load = () => {
    if (!inputs) return;
    navigate({
      to: "/tech-chooser",
      search: { tab: "chooser", ...inputs },
    });
  };

  const handleDelete = () => {
    deleteDecision(decision.id, {
      onSuccess: () => toast.success(t("techchoice.history.deleted")),
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{decision.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(decision.created_at)}
        </span>
      </div>

      {inputs && (
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <SummaryChip
            label={t("techchoice.history.category")}
            value={inputs.category ?? "—"}
          />
          <SummaryChip
            label={t("techchoice.history.constraints")}
            value={String(constraintCount)}
          />
          <SummaryChip
            label={t("techchoice.history.top_match")}
            value={topName ?? "—"}
          />
        </dl>
      )}

      <div className="flex items-center gap-1">
        {inputs && (
          <Button variant="outline" size="sm" onClick={load}>
            {t("techchoice.history.load")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("techchoice.history.delete")}
          disabled={isDeleting}
          onClick={handleDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="max-w-40 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
