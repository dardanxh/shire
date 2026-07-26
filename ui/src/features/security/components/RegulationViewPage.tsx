import { getRouteApi, Link } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  GavelIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RegulationArticle } from "../api";
import { useDataRegulationQuery, useDataSafetyPracticesQuery } from "../api";
import {
  artAnchor,
  REGULATION_CATEGORY_COLORS,
  type UnitLabel,
  unitRef,
} from "../schemas";

const route = getRouteApi("/security/regulations/$id");

export function RegulationViewPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();

  const { data: regulation, isPending } = useDataRegulationQuery(id);

  // Deep links (#art-32) land after data renders — scroll the anchor into view.
  useEffect(() => {
    if (!regulation || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: "start" });
  }, [regulation]);

  if (isPending || !regulation) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const stripeColor = REGULATION_CATEGORY_COLORS[regulation.category];

  // Preserve article order while grouping into chapters; null chapters render flat.
  const chapters: Array<{
    chapter: string | null;
    articles: RegulationArticle[];
  }> = [];
  for (const article of regulation.articles) {
    const last = chapters[chapters.length - 1];
    if (last && last.chapter === (article.chapter ?? null)) {
      last.articles.push(article);
    } else {
      chapters.push({ chapter: article.chapter ?? null, articles: [article] });
    }
  }
  const tocChapters = chapters.filter((group) => group.chapter !== null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold">
            {regulation.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {regulation.full_name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="accent"
              style={{ backgroundColor: `${stripeColor}26` }}
            >
              {t(`security.category.${regulation.category}`)}
            </Badge>
            <Badge variant="outline">
              {t(`security.region.${regulation.region}`)}
            </Badge>
            <Badge
              variant={regulation.status === "in_force" ? "success" : "warning"}
            >
              {t(`security.status.${regulation.status}`)}
            </Badge>
            {regulation.effective_date && (
              <span className="text-xs text-muted-foreground">
                {t("security.regulation.effective")}:{" "}
                {regulation.effective_date}
              </span>
            )}
          </div>
        </div>
        {regulation.official_url && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a
                href={regulation.official_url}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLinkIcon />
            {t("security.regulation.official_text")}
          </Button>
        )}
      </div>

      {regulation.description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {regulation.description}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {regulation.who_is_impacted.length > 0 && (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col gap-3 pt-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <UsersIcon className="size-4 text-muted-foreground" />
                {t("security.regulation.who_is_impacted")}
              </h2>
              <ul className="flex flex-col gap-2">
                {regulation.who_is_impacted.map((entry) => (
                  <li
                    key={entry}
                    className="flex items-start gap-2 text-sm leading-relaxed"
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                    {entry}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {regulation.penalties && (
          <Card className="bg-destructive/5">
            <CardContent className="flex flex-col gap-3 pt-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <GavelIcon className="size-4 text-muted-foreground" />
                {t("security.regulation.penalties")}
              </h2>
              <p className="text-sm leading-relaxed">{regulation.penalties}</p>
              {regulation.jurisdiction && (
                <p className="text-xs text-muted-foreground">
                  {t("security.regulation.jurisdiction")}:{" "}
                  {regulation.jurisdiction}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <RelatedPractices slugs={regulation.related_practice_slugs} />

      {/* Article browser: sticky chapter TOC beside chapter-grouped cards. */}
      <div className="flex flex-col gap-4">
        <h2 className="border-b pb-2 text-lg font-medium">
          {t("security.regulation.provisions")}
        </h2>
        <div className="flex items-start gap-8">
          {tocChapters.length > 1 && (
            <nav className="sticky top-20 hidden w-56 shrink-0 flex-col gap-1 lg:flex">
              <p className="pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("security.regulation.contents")}
              </p>
              {tocChapters.map((group) => (
                <a
                  key={group.chapter}
                  href={`#${artAnchor(group.articles[0].number)}`}
                  className="rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {group.chapter}
                </a>
              ))}
            </nav>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {chapters.map((group) => (
              <section
                key={group.chapter ?? "flat"}
                className="flex flex-col gap-3"
              >
                {group.chapter && (
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {group.chapter}
                  </h3>
                )}
                {group.articles.map((article) =>
                  article.is_key ? (
                    <KeyArticleCard
                      key={article.number}
                      article={article}
                      unitLabel={regulation.unit_label}
                      regulationName={regulation.name}
                    />
                  ) : (
                    <div
                      key={article.number}
                      id={artAnchor(article.number)}
                      className="flex scroll-mt-20 items-baseline gap-3 rounded-lg border bg-card px-4 py-2.5"
                    >
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {unitRef(
                          regulation.unit_label,
                          article.number,
                          article.ref,
                        )}
                      </span>
                      <span className="text-sm">{article.title}</span>
                    </div>
                  ),
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyArticleCard({
  article,
  unitLabel,
  regulationName,
}: {
  article: RegulationArticle;
  unitLabel: UnitLabel;
  regulationName: string;
}) {
  const { t } = useTranslation();
  // Collapsed by default; a deep link (#art-32) opens its target so practice
  // chips land on visible content.
  const [expanded, setExpanded] = useState(
    () => window.location.hash === `#${artAnchor(article.number)}`,
  );

  return (
    <Card
      id={artAnchor(article.number)}
      className={cn("scroll-mt-20 gap-0 border-l-4 border-l-primary/40")}
    >
      <CardContent className="flex flex-col gap-3 py-4">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex flex-wrap items-center gap-2 text-left"
        >
          <Badge variant="secondary" className="font-mono">
            {article.ref ??
              `${unitRef(unitLabel, article.number)} ${regulationName}`}
          </Badge>
          <span className="font-medium">{article.title}</span>
          <span className="ml-auto flex items-center gap-2">
            <Badge variant="accent">{t("security.regulation.key_badge")}</Badge>
            <ChevronDownIcon
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </span>
        </button>
        {expanded && (
          <>
            {article.summary && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {article.summary}
              </p>
            )}
            {(article.key_requirements?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("security.regulation.key_requirements")}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {article.key_requirements?.map((requirement) => (
                    <li
                      key={requirement}
                      className="flex items-start gap-2 text-sm"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/50" />
                      {requirement}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(article.paragraphs?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-1.5 border-t pt-3">
                {article.paragraphs?.map((paragraph) => (
                  <div
                    key={paragraph.ref}
                    className="flex items-baseline gap-3"
                  >
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {paragraph.ref}
                    </span>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {paragraph.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Safety practices that help comply, resolved from slugs client-side. */
function RelatedPractices({ slugs }: { slugs: string[] }) {
  const { t } = useTranslation();
  const { data } = useDataSafetyPracticesQuery({});

  // Client-side slug resolution — unresolved slugs are silently dropped.
  const bySlug = new Map((data?.items ?? []).map((x) => [x.slug, x]));
  const practices = slugs
    .map((slug) => bySlug.get(slug))
    .filter((x) => x !== undefined);
  if (practices.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t("security.regulation.related_practices")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {practices.map((practice) => (
          <Link
            key={practice.id}
            to="/security/practices/$id"
            params={{ id: practice.id }}
            className="rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            {practice.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
