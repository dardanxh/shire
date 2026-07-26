import { getRouteApi } from "@tanstack/react-router";
import { RotateCcwIcon, SaveIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  flattenCategories,
  groupSlugsByCategoryId,
  useTechnologyCategoriesQuery,
  useTechnologyCorpusQuery,
} from "@/features/technologies";
import { cn } from "@/lib/utils";
import {
  AXES,
  type Axis,
  COST_TIERS,
  DEFAULT_SEARCH,
  DEPLOYMENT_MODELS,
  MATURITIES,
  parseSavedInputs,
  searchToConstraints,
  searchToWeights,
  type TechChooserSearch,
  WEIGHT_LEVELS,
} from "../schemas";
import { scoreCandidates } from "../score";
import { ResultsList } from "./ResultsList";
import { SaveDecisionDialog } from "./SaveDecisionDialog";

const route = getRouteApi("/tech-chooser");

export function ChooserPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();
  const [saveOpen, setSaveOpen] = useState(false);

  const { data: techs } = useTechnologyCorpusQuery();
  const { data: categoryTree } = useTechnologyCategoriesQuery();
  const categories = useMemo(
    () => flattenCategories(categoryTree),
    [categoryTree],
  );
  const groupSlugs = groupSlugsByCategoryId(categoryTree);

  // URL is the durable, shareable source of truth; a local mirror keeps controls instant.
  const [draft, setDraft] = useState<TechChooserSearch>(search);
  const lastSearchRef = useRef(search);
  if (lastSearchRef.current !== search) {
    lastSearchRef.current = search;
    setDraft(search);
  }

  const urlTimer = useRef<number | undefined>(undefined);
  const setField = <K extends keyof TechChooserSearch>(
    key: K,
    value: TechChooserSearch[K],
  ) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    window.clearTimeout(urlTimer.current);
    urlTimer.current = window.setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, [key]: value }),
        replace: true,
      });
    }, 200);
  };

  const reset = () => {
    window.clearTimeout(urlTimer.current);
    const next = { ...draft, ...DEFAULT_SEARCH, category: draft.category };
    setDraft(next);
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  };

  const selectedCategory = categories.find((c) => c.slug === draft.category);
  const weights = searchToWeights(draft);
  const result = useMemo(() => {
    const category = categories.find((c) => c.slug === draft.category);
    if (!techs || !category) return null;
    return scoreCandidates(
      techs,
      category.id,
      searchToWeights(draft),
      searchToConstraints(draft),
    );
  }, [techs, categories, draft]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold">
            {t("techchoice.title")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("techchoice.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcwIcon />
            {t("techchoice.actions.reset")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedCategory}
            onClick={() => setSaveOpen(true)}
          >
            <SaveIcon />
            {t("techchoice.actions.save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Controls */}
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <span className="text-sm font-medium">
              {t("techchoice.category_label")}
            </span>
            <Select
              items={categories.map((c) => ({ value: c.slug, label: c.label }))}
              value={draft.category ?? null}
              onValueChange={(value) =>
                setField("category", value ?? undefined)
              }
            >
              <SelectTrigger className="bg-background">
                <SelectValue
                  placeholder={t("techchoice.category_placeholder")}
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-medium">
                {t("techchoice.priorities_title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("techchoice.priorities_subtitle")}
              </p>
            </div>
            {AXES.map((axis) => (
              <WeightControl
                key={axis}
                axis={axis}
                value={draft[`w_${axis}` as const]}
                onChange={(level) => setField(`w_${axis}` as const, level)}
              />
            ))}
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-medium">
                {t("techchoice.constraints_title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("techchoice.constraints_subtitle")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">
                {t("techchoice.constraint.oss_only")}
              </span>
              <Switch
                checked={draft.c_oss_only === 1}
                onCheckedChange={(checked) =>
                  setField("c_oss_only", checked ? 1 : 0)
                }
              />
            </div>
            <ConstraintSelect
              label={t("techchoice.constraint.deployment")}
              anyLabel={t("techchoice.constraint.deployment_any")}
              value={draft.c_deployment ?? null}
              options={DEPLOYMENT_MODELS.map((m) => ({
                value: m,
                label: t(`technologies.deployment.${m}`),
              }))}
              onChange={(v) =>
                setField("c_deployment", (v ?? undefined) as never)
              }
            />
            <ConstraintSelect
              label={t("techchoice.constraint.max_cost_tier")}
              anyLabel={t("techchoice.constraint.max_cost_tier_any")}
              value={draft.c_max_cost_tier ?? null}
              options={COST_TIERS.map((c) => ({
                value: c,
                label: t(`technologies.adoption.tier_${c}`),
              }))}
              onChange={(v) =>
                setField("c_max_cost_tier", (v ?? undefined) as never)
              }
            />
            <ConstraintSelect
              label={t("techchoice.constraint.min_maturity")}
              anyLabel={t("techchoice.constraint.min_maturity_any")}
              value={draft.c_min_maturity ?? null}
              options={MATURITIES.map((m) => ({
                value: m,
                label: t(`technologies.maturity.${m}`),
              }))}
              onChange={(v) =>
                setField("c_min_maturity", (v ?? undefined) as never)
              }
            />
          </section>
        </div>

        {/* Results */}
        <ResultsList
          result={result}
          weights={weights}
          groupSlugs={groupSlugs}
          hasCategory={Boolean(selectedCategory)}
        />
      </div>

      {selectedCategory && (
        <SaveDecisionDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          // Strip `tab` (and re-validate) so the stored config round-trips
          // straight back into /tech-chooser search params on Load.
          inputs={parseSavedInputs(draft)}
        />
      )}
    </div>
  );
}

function WeightControl({
  axis,
  value,
  onChange,
}: {
  axis: Axis;
  value: number;
  onChange: (level: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-muted-foreground">
        {t(`techchoice.axis.${axis}`)}
      </span>
      <div className="inline-flex rounded-lg border p-0.5">
        {WEIGHT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              value === level
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`techchoice.weight_level.${level}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConstraintSelect({
  label,
  anyLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  const items = [{ value: null, label: anyLabel }, ...options];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Select items={items} value={value} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="min-w-40 bg-background">
          <SelectValue placeholder={anyLabel} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.label} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
