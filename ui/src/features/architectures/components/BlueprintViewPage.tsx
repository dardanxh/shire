import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyPlusIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QualitiesSection } from "@/features/qualities";
import { useTechnologyCorpusQuery } from "@/features/technologies";
import { cn } from "@/lib/utils";
import {
  type Blueprint,
  type BlueprintStage,
  useBlueprintQuery,
  useBlueprintsQuery,
  useCloneBlueprintMutation,
} from "../api";
import { LIST_SEARCH } from "../keys";
import { STACK_PROFILES } from "../stack-profiles";
import { DeleteBlueprintDialog } from "./DeleteBlueprintDialog";
import { DiagramTabs, sortDiagramKinds } from "./DiagramTabs";
import { DiagramViewer } from "./DiagramViewer";

const route = getRouteApi("/architectures/$id/");

/** Corpus chip linking to the technology view; falls back to the raw id. */
function TechnologyChip({
  technologyId,
  namesById,
  variant = "secondary",
}: {
  technologyId: string;
  namesById: Map<string, string>;
  variant?: "secondary" | "outline";
}) {
  return (
    <Link to="/technologies/$id" params={{ id: technologyId }}>
      <Badge variant={variant} className="hover:border-primary/40">
        {namesById.get(technologyId) ?? technologyId}
      </Badge>
    </Link>
  );
}

function StagesTable({
  stages,
  namesById,
}: {
  stages: BlueprintStage[];
  namesById: Map<string, string>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const none = t("blueprints.view.none");

  const toggle = (stageId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                {t("blueprints.columns.position")}
              </TableHead>
              <TableHead>{t("blueprints.columns.name")}</TableHead>
              <TableHead>{t("blueprints.columns.role")}</TableHead>
              <TableHead>{t("blueprints.columns.recommended")}</TableHead>
              <TableHead>{t("blueprints.columns.alternatives")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((stage) => (
              <Fragment key={stage.id}>
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    {stage.position}
                  </TableCell>
                  <TableCell className="font-medium">{stage.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {stage.role || none}
                  </TableCell>
                  <TableCell>
                    {stage.recommended_technology_id ? (
                      <TechnologyChip
                        technologyId={stage.recommended_technology_id}
                        namesById={namesById}
                      />
                    ) : (
                      none
                    )}
                  </TableCell>
                  <TableCell>
                    {stage.alternative_technology_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {stage.alternative_technology_ids.map((id) => (
                          <TechnologyChip
                            key={id}
                            technologyId={id}
                            namesById={namesById}
                            variant="outline"
                          />
                        ))}
                      </div>
                    ) : (
                      none
                    )}
                  </TableCell>
                  <TableCell>
                    {stage.rationale && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          expanded.has(stage.id)
                            ? t("blueprints.view.hide_rationale")
                            : t("blueprints.view.show_rationale")
                        }
                        onClick={() => toggle(stage.id)}
                      >
                        {expanded.has(stage.id) ? (
                          <ChevronUpIcon />
                        ) : (
                          <ChevronDownIcon />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {expanded.has(stage.id) && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="bg-muted/40">
                      <p className="max-w-prose text-sm whitespace-pre-wrap text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {t("blueprints.view.rationale")}:{" "}
                        </span>
                        {stage.rationale}
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Full-width description card: collapsed it clamps to two lines; "Show more"
 * expands the full text plus the source/family tags and supported use cases.
 */
function AboutCard({ blueprint }: { blueprint: Blueprint }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!blueprint.description) return null;

  return (
    <section className="flex w-full flex-col gap-2 rounded-xl border bg-card p-4">
      <p
        className={cn(
          "text-sm whitespace-pre-wrap text-muted-foreground",
          !open && "line-clamp-2",
        )}
      >
        {blueprint.description}
      </p>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="secondary">
              {t(`blueprints.complexity.${blueprint.complexity}`, {
                defaultValue: blueprint.complexity,
              })}
            </Badge>
            {blueprint.family_tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {t(`archetypes.family.${tag}`)}
              </Badge>
            ))}
          </div>
          {blueprint.use_cases.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("blueprints.view.use_cases")}
              </span>
              {blueprint.use_cases.map((slug) => (
                <Badge key={slug} variant="secondary">
                  {t(`blueprints.use_case_tags.${slug}`, {
                    defaultValue: slug,
                  })}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
      <button
        type="button"
        className="flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? t("blueprints.view.show_less") : t("blueprints.view.show_more")}
        {open ? (
          <ChevronUpIcon className="size-3.5" />
        ) : (
          <ChevronDownIcon className="size-3.5" />
        )}
      </button>
    </section>
  );
}

/** One-sentence guidance bullets rendered as small cards with a tone icon. */
function GuidanceCards({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "negative";
}) {
  const { t } = useTranslation();
  const Icon = tone === "positive" ? CircleCheckIcon : CircleXIcon;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item}
              className="flex items-start gap-2.5 rounded-xl border bg-card p-3"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  tone === "positive" ? "text-emerald-600" : "text-rose-500",
                )}
              />
              <p className="text-sm text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("blueprints.view.none")}
        </p>
      )}
    </section>
  );
}

/** Multi-view diagram section: kind tabs (conceptual first) + pan/zoom viewer. */
function DiagramSection({ blueprint }: { blueprint: Blueprint }) {
  const { t } = useTranslation();
  const kinds = sortDiagramKinds(blueprint.diagrams.map((d) => d.kind));
  const [active, setActive] = useState(kinds[0] ?? "");
  const current =
    blueprint.diagrams.find((d) => d.kind === active) ?? blueprint.diagrams[0];

  if (!current?.mermaid.trim()) return null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{t("blueprints.view.diagram")}</h2>
        <DiagramTabs kinds={kinds} active={active} onChange={setActive} />
      </div>
      <DiagramViewer
        key={current.kind}
        source={current.mermaid}
        fullscreenId={blueprint.id}
        fullscreenView={current.kind}
        exportName={`${blueprint.slug}-${current.kind}`}
        className="h-[440px]"
      />
      {STACK_PROFILES[current.kind] && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">
            {t("blueprints.stack_profiles.license")}:
          </span>
          <Badge variant="outline">
            {t(
              `blueprints.stack_profiles.level_${STACK_PROFILES[current.kind].license}`,
            )}
          </Badge>
          <span className="font-medium">
            {t("blueprints.stack_profiles.ops")}:
          </span>
          <Badge variant="outline">
            {t(
              `blueprints.stack_profiles.level_${STACK_PROFILES[current.kind].ops}`,
            )}
          </Badge>
          <span>{t(`blueprints.stack_profiles.note_${current.kind}`)}</span>
        </div>
      )}
    </section>
  );
}

/** Forward + reverse evolution links: what this architecture grows into / from. */
function EvolutionSection({ blueprint }: { blueprint: Blueprint }) {
  const { t } = useTranslation();
  const { data: all } = useBlueprintsQuery({});
  const bySlug = new Map((all ?? []).map((b) => [b.slug, b]));
  const forward = blueprint.evolution
    .map((edge) => ({ target: bySlug.get(edge.to_slug), reason: edge.reason }))
    .filter((e) => e.target);
  const backward = (all ?? [])
    .filter((b) => b.evolution.some((edge) => edge.to_slug === blueprint.slug))
    .map((b) => ({
      source: b,
      reason:
        b.evolution.find((edge) => edge.to_slug === blueprint.slug)?.reason ??
        "",
    }));
  if (forward.length === 0 && backward.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("blueprints.view.evolution")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {forward.map(({ target, reason }) => (
          <Link
            key={target?.id}
            to="/architectures/$id"
            params={{ id: target?.id ?? "" }}
            className="flex items-start gap-2.5 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md"
          >
            <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm">
              <span className="font-medium">
                {t("blueprints.view.evolves_to", { name: target?.name })}
              </span>
              {reason && (
                <span className="text-muted-foreground"> — {reason}</span>
              )}
            </p>
          </Link>
        ))}
        {backward.map(({ source, reason }) => (
          <Link
            key={source.id}
            to="/architectures/$id"
            params={{ id: source.id }}
            className="flex items-start gap-2.5 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md"
          >
            <ArrowLeftIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm">
              <span className="font-medium">
                {t("blueprints.view.evolves_from", { name: source.name })}
              </span>
              {reason && (
                <span className="text-muted-foreground"> — {reason}</span>
              )}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function BlueprintViewPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { mutate: cloneBlueprint, isPending: isCloning } =
    useCloneBlueprintMutation();
  const handleUse = () =>
    cloneBlueprint(
      { id },
      {
        onSuccess: (created) => {
          toast.success(t("blueprints.list.use_success"));
          navigate({ to: "/architectures/$id", params: { id: created.id } });
        },
      },
    );

  const {
    data: blueprint,
    isPending,
    isError,
    refetch,
  } = useBlueprintQuery(id);
  const { data: corpus } = useTechnologyCorpusQuery();
  const namesById = new Map((corpus ?? []).map((tech) => [tech.id, tech.name]));

  if (isPending) {
    return (
      <div className="flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !blueprint) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            {t("common.table.error")}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            {t("common.actions.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const isSeed = blueprint.source === "seed";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-heading text-xl font-semibold">{blueprint.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleUse} disabled={isCloning}>
            <CopyPlusIcon />
            {t("blueprints.list.use_button")}
          </Button>
          <Button
            variant="outline"
            render={
              <Link
                to="/architectures/$id/edit"
                params={{ id: blueprint.id }}
              />
            }
          >
            <PencilIcon />
            {t("common.actions.edit")}
          </Button>
          {!isSeed && (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2Icon />
              {t("common.actions.delete")}
            </Button>
          )}
        </div>
      </div>

      <AboutCard blueprint={blueprint} />

      <DiagramSection blueprint={blueprint} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GuidanceCards
          title={t("blueprints.view.when_to_use")}
          items={blueprint.when_to_use}
          tone="positive"
        />
        <GuidanceCards
          title={t("blueprints.view.when_not_to_use")}
          items={blueprint.when_not_to_use}
          tone="negative"
        />
      </div>

      {blueprint.hot_spots.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">
            {t("blueprints.view.hot_spots")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {blueprint.hot_spots.map((spot) => (
              <div
                key={spot.title}
                className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3"
              >
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p className="text-sm">
                  <span className="font-medium">{spot.title}</span>
                  {spot.detail && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {spot.detail}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <EvolutionSection blueprint={blueprint} />

      <QualitiesSection blueprintSlug={blueprint.slug} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t("blueprints.view.stages")}</h2>
        {blueprint.stages.length > 0 ? (
          <StagesTable stages={blueprint.stages} namesById={namesById} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("blueprints.view.no_stages")}
          </p>
        )}
      </section>

      <DeleteBlueprintDialog
        blueprint={blueprint}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() =>
          navigate({ to: "/architectures", search: LIST_SEARCH })
        }
      />
    </div>
  );
}
