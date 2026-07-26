import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  LightbulbIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MermaidDiagram } from "@/components/shared/MermaidDiagram";
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
import {
  groupSlugsByCategoryId,
  TechnologyLogo,
  useTechnologyCategoriesQuery,
  useTechnologyCorpusQuery,
} from "@/features/technologies";
import { useModellingStrategyQuery } from "../api";
import { COMPLEXITY_BADGE_VARIANT, type ModellingExample } from "../schemas";
import { DeleteModellingStrategyDialog } from "./DeleteModellingStrategyDialog";

const route = getRouteApi("/data/$id/");

export function ModellingStrategyViewPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: strategy, isPending } = useModellingStrategyQuery(id);

  if (isPending || !strategy) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  const origin = [strategy.origin_year, strategy.originator]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold">
            {strategy.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="accent">
              {t(`modelling.family.${strategy.family}`)}
            </Badge>
            <Badge variant={COMPLEXITY_BADGE_VARIANT[strategy.complexity]}>
              {t(`modelling.complexity.${strategy.complexity}`)}
            </Badge>
            {origin && (
              <span className="text-xs text-muted-foreground">
                {t("modelling.view.origin")}: {origin}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/data/$id/edit" params={{ id }} />}
          >
            <PencilIcon />
            {t("common.actions.edit")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            {t("common.actions.delete")}
          </Button>
        </div>
      </div>

      {strategy.best_for && (
        <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <span className="font-medium">{t("modelling.view.best_for")}: </span>
          {strategy.best_for}
        </div>
      )}

      {strategy.description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {strategy.description}
        </p>
      )}

      <div className="grid gap-6 rounded-xl border p-4 sm:grid-cols-2 md:p-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("modelling.view.pros")}</h2>
          <ul className="flex flex-col gap-2">
            {strategy.pros.map((pro) => (
              <li key={pro} className="flex items-start gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                {pro}
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("modelling.view.cons")}</h2>
          <ul className="flex flex-col gap-2">
            {strategy.cons.map((con) => (
              <li key={con} className="flex items-start gap-2 text-sm">
                <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                {con}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {strategy.example && <WorkedExample example={strategy.example} />}

      {/* Diagrams only fit the modelling topic (ERDs, schema shapes). */}
      {strategy.topic === "modelling" && strategy.diagram.trim() && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{t("modelling.view.diagram")}</h2>
          <div className="overflow-x-auto rounded-xl border bg-card p-4">
            <MermaidDiagram source={strategy.diagram} />
          </div>
        </section>
      )}

      <RelatedTechnologies slugs={strategy.related_technology_slugs} />

      <DeleteModellingStrategyDialog
        strategy={strategy}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() =>
          navigate({ to: "/data", search: { tab: strategy.topic } })
        }
      />
    </div>
  );
}

/** Sample tables + the decisions that make the strategy concrete. */
function WorkedExample({ example }: { example: ModellingExample }) {
  const { t } = useTranslation();
  // The generated type marks defaulted fields optional — normalize once here.
  const narrative = example.narrative ?? "";
  const tables = example.tables ?? [];
  const snippets = example.snippets ?? [];
  const decisions = example.decisions ?? [];
  if (
    !narrative.trim() &&
    tables.length === 0 &&
    snippets.length === 0 &&
    decisions.length === 0
  ) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4 md:p-6">
      <h2 className="text-sm font-medium">{t("modelling.view.example")}</h2>
      {narrative && (
        <p className="max-w-3xl text-sm text-muted-foreground">{narrative}</p>
      )}
      {snippets.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {snippets.map((snippet) => (
            <div key={snippet.name} className="flex flex-col gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">
                {snippet.name}
              </span>
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                <code>{snippet.code}</code>
              </pre>
            </div>
          ))}
        </div>
      )}
      {tables.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {tables.map((table) => (
            <div key={table.name} className="flex flex-col gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">
                {table.name}
              </span>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(table.columns ?? []).map((column) => (
                        <TableHead key={column} className="text-xs">
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(table.rows ?? []).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="text-xs">
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
      {decisions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("modelling.view.decisions")}
          </h3>
          <ul className="flex flex-col gap-2">
            {decisions.map((decision) => (
              <li key={decision} className="flex items-start gap-2 text-sm">
                <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                {decision}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Corpus technologies that pair well with the strategy, as logo chips. */
function RelatedTechnologies({ slugs }: { slugs: string[] }) {
  const { t } = useTranslation();
  const { data: corpus } = useTechnologyCorpusQuery();
  const { data: categoryTree } = useTechnologyCategoriesQuery();
  const groupSlugs = groupSlugsByCategoryId(categoryTree);

  // Client-side slug resolution — unresolved slugs are silently dropped.
  const bySlug = new Map((corpus ?? []).map((x) => [x.slug, x]));
  const technologies = slugs
    .map((slug) => bySlug.get(slug))
    .filter((x) => x !== undefined);
  if (technologies.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("modelling.view.related")}</h2>
      <div className="flex flex-wrap gap-2">
        {technologies.map((technology) => (
          <Link
            key={technology.id}
            to="/technologies/$id"
            params={{ id: technology.id }}
            className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-3 pl-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            <TechnologyLogo
              name={technology.name}
              homepageUrl={technology.homepage_url}
              groupSlug={groupSlugs.get(technology.category_id)}
              className="size-6 rounded-md"
            />
            {technology.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
