import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  ExternalLinkIcon,
  LockIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  type Technology,
  useInfiniteTechnologiesQuery,
  useTechnologyBlueprintsQuery,
  useTechnologyCategoriesQuery,
  useTechnologyQuery,
  useUpdateTechnologyMutation,
} from "../api";
import { categoryNamesById, groupSlugsByCategoryId } from "../category-utils";
import { LIST_SEARCH } from "../keys";
import { DeleteTechnologyDialog } from "./DeleteTechnologyDialog";
import { TechnologyLogo } from "./TechnologyLogo";

const route = getRouteApi("/technologies/$id/");

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export function TechnologyViewPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { mutate: updateTechnology } = useUpdateTechnologyMutation(id);

  const {
    data: technology,
    isPending,
    isError,
    refetch,
  } = useTechnologyQuery(id);
  const { data: categoryTree } = useTechnologyCategoriesQuery();
  const namesById = categoryNamesById(categoryTree);

  if (isPending) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (isError || !technology) {
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

  const none = t("technologies.view.none");
  const secondaryNames = technology.secondary_category_ids
    .map((categoryId) => namesById.get(categoryId))
    .filter((name): name is string => Boolean(name));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-heading text-xl font-semibold">
            {technology.name}
          </h1>
          <span className="text-sm text-muted-foreground">
            {technology.slug}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => updateTechnology({ starred: !technology.starred })}
          >
            <StarIcon
              className={cn(technology.starred && "fill-warning text-warning")}
            />
            {t(
              technology.starred
                ? "technologies.view.starred"
                : "technologies.view.star",
            )}
          </Button>
          <Button
            variant="outline"
            render={
              <Link
                to="/technologies/$id/edit"
                params={{ id: technology.id }}
              />
            }
          >
            <PencilIcon />
            {t("common.actions.edit")}
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            {t("common.actions.delete")}
          </Button>
        </div>
      </div>

      {/* Adoption profile — curated corpus metadata at a glance. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {t("technologies.adoption.learning_curve")}:
          </span>
          <Badge variant="outline">
            {t(`technologies.adoption.curve_${technology.learning_curve}`)}
          </Badge>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {t("technologies.adoption.time_to_win")}:
          </span>
          <Badge variant="outline">
            {t(`technologies.adoption.ttw_${technology.time_to_win}`)}
          </Badge>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {t("technologies.adoption.cost")}:
          </span>
          <Badge variant="outline">
            {t(`technologies.adoption.cost_${technology.cost_model}`)}
          </Badge>
          <span className="text-muted-foreground">
            {t(`technologies.adoption.tier_${technology.cost_tier}`)}
          </span>
        </span>
      </div>

      <dl className="flex flex-col gap-4 rounded-xl border p-4 md:p-6">
        <DetailRow label={t("technologies.view.description")}>
          {technology.description || none}
        </DetailRow>
        <DetailRow label={t("technologies.view.category")}>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">
              {namesById.get(technology.category_id) ?? none}
            </Badge>
            {secondaryNames.map((name) => (
              <Badge key={name} variant="outline">
                {name}
              </Badge>
            ))}
          </div>
        </DetailRow>
        <DetailRow label={t("technologies.view.aliases")}>
          {technology.aliases.length > 0 ? technology.aliases.join(", ") : none}
        </DetailRow>
        <DetailRow label={t("technologies.view.tags")}>
          {technology.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {technology.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            none
          )}
        </DetailRow>
        <DetailRow label={t("technologies.view.deployment")}>
          {technology.deployment_models.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {technology.deployment_models.map((model) => (
                <Badge key={model} variant="outline">
                  {t(`technologies.deployment.${model}`)}
                </Badge>
              ))}
            </div>
          ) : (
            none
          )}
        </DetailRow>
        <DetailRow label={t("technologies.view.maturity")}>
          {t(`technologies.maturity.${technology.maturity}`)}
        </DetailRow>
        <DetailRow label={t("technologies.view.oss")}>
          {technology.oss
            ? t("technologies.oss.yes")
            : t("technologies.oss.no")}
        </DetailRow>
        <DetailRow label={t("technologies.view.homepage")}>
          {technology.homepage_url ? (
            <a
              href={technology.homepage_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {technology.homepage_url}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : (
            none
          )}
        </DetailRow>
      </dl>

      {technology.auth_methods.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("technologies.auth_methods.title")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {technology.auth_methods.map((method) => (
              <div
                key={method.slug}
                className="flex flex-col gap-2 rounded-xl border p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{method.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {method.slug}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(method.fields ?? []).map((field) => (
                    <Badge key={field.key} variant="outline">
                      {field.secret && <LockIcon className="size-3" />}
                      {field.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <UsedInArchitectures technologyId={technology.id} />
      <Alternatives technology={technology} categoryTree={categoryTree} />

      <DeleteTechnologyDialog
        technology={technology}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate({ to: "/technologies", search: LIST_SEARCH })}
      />
    </div>
  );
}

/** Architecture blueprints whose stages recommend or list this technology. */
function UsedInArchitectures({ technologyId }: { technologyId: string }) {
  const { t } = useTranslation();
  const { data: refs } = useTechnologyBlueprintsQuery(technologyId);
  if (!refs) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("technologies.view.used_in")}</h2>
      {refs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("technologies.view.used_in_empty")}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {refs.map((ref) => (
            <Link
              key={`${ref.blueprint_id}-${ref.stage_name}-${ref.role}`}
              to="/architectures/$id"
              params={{ id: ref.blueprint_id }}
              className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {ref.blueprint_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ref.stage_name}
                </span>
              </span>
              <Badge
                variant={ref.role === "recommended" ? "default" : "outline"}
              >
                {ref.role}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Other technologies in the same category, as quick-jump chips. */
function Alternatives({
  technology,
  categoryTree,
}: {
  technology: Technology;
  categoryTree: ReturnType<typeof useTechnologyCategoriesQuery>["data"];
}) {
  const { t } = useTranslation();
  const slug = (() => {
    for (const group of categoryTree ?? []) {
      if (group.id === technology.category_id) return group.slug;
      for (const child of group.children ?? []) {
        if (child.id === technology.category_id) return child.slug;
      }
    }
    return undefined;
  })();
  const { data } = useInfiniteTechnologiesQuery({ category: slug });
  const groupSlugs = groupSlugsByCategoryId(categoryTree);
  const siblings = (data?.pages.flatMap((page) => page.items) ?? [])
    .filter((x) => x.id !== technology.id)
    .slice(0, 8);
  if (!slug || siblings.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t("technologies.view.alternatives")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {siblings.map((x) => (
          <Link
            key={x.id}
            to="/technologies/$id"
            params={{ id: x.id }}
            className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-3 pl-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            <TechnologyLogo
              name={x.name}
              homepageUrl={x.homepage_url}
              groupSlug={groupSlugs.get(x.category_id)}
              className="size-6 rounded-md"
            />
            {x.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
