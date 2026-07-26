import { Link } from "@tanstack/react-router";

import {
  groupSlugsByCategoryId,
  TechnologyLogo,
  useTechnologyCategoriesQuery,
  useTechnologyCorpusQuery,
} from "@/features/technologies";
import { cn } from "@/lib/utils";

/**
 * Corpus technologies as logo chips, resolved from slugs client-side. With a `title`
 * it renders a titled section; without one it renders a bare inline chip row (used for
 * per-mechanism technology hints). Unresolved slugs are silently dropped.
 */
export function QualityTechChips({
  slugs,
  title,
  compact = false,
}: {
  slugs: string[];
  title?: string;
  compact?: boolean;
}) {
  const { data: corpus } = useTechnologyCorpusQuery();
  const { data: categoryTree } = useTechnologyCategoriesQuery();
  const groupSlugs = groupSlugsByCategoryId(categoryTree);

  const bySlug = new Map((corpus ?? []).map((x) => [x.slug, x]));
  const technologies = slugs
    .map((slug) => bySlug.get(slug))
    .filter((x) => x !== undefined);
  if (technologies.length === 0) return null;

  const chips = (
    <div className="flex flex-wrap gap-1.5">
      {technologies.map((technology) => (
        <Link
          key={technology.id}
          to="/technologies/$id"
          params={{ id: technology.id }}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border bg-card transition-colors hover:bg-muted/50",
            compact ? "py-1 pr-2 pl-1 text-xs" : "py-1.5 pr-3 pl-1.5 text-sm",
          )}
        >
          <TechnologyLogo
            name={technology.name}
            homepageUrl={technology.homepage_url}
            groupSlug={groupSlugs.get(technology.category_id)}
            className={cn("rounded-md", compact ? "size-4" : "size-6")}
          />
          {technology.name}
        </Link>
      ))}
    </div>
  );

  if (!title) return chips;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {chips}
    </section>
  );
}
