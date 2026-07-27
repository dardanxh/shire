import { SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HobitMultiSelect } from "@/components/shared/HobitMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHobitsQuery } from "@/features/hobits/api";
import type { CouncilTopicDetailOut } from "@/lib/api";
import { useUpdateCouncilMembersMutation } from "../api";

/** Pick who debates: the full hobit roster with the LLM-suggested members surfaced as chips.
 * Every toggle saves immediately (single-user app — no draft state needed). */
export function RosterEditor({ topic }: { topic: CouncilTopicDetailOut }) {
  const { t } = useTranslation();
  const { data: hobits } = useHobitsQuery();
  const { mutate: setMembers, isPending } = useUpdateCouncilMembersMutation(
    topic.id,
  );

  const selected = new Set(topic.member_slugs);
  const toggle = (slug: string) => {
    const next = selected.has(slug)
      ? topic.member_slugs.filter((s) => s !== slug)
      : [...topic.member_slugs, slug];
    setMembers(next);
  };

  const suggested = topic.suggested_slugs ?? [];
  const names = new Map((hobits ?? []).map((h) => [h.slug, h.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("council.roster.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {topic.status === "suggesting" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SparklesIcon className="size-4 animate-pulse" />
            {t("council.roster.suggesting_hint")}
          </p>
        ) : null}
        {topic.roster_error ? (
          <p className="text-sm text-destructive">
            {t("council.roster.suggestion_failed")}
          </p>
        ) : null}
        {suggested.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("council.roster.suggested")}
            </span>
            {suggested.map((slug) => (
              <Badge
                key={slug}
                variant={selected.has(slug) ? "secondary" : "outline"}
              >
                {names.get(slug) ?? slug}
              </Badge>
            ))}
          </div>
        ) : null}
        <fieldset disabled={isPending}>
          <HobitMultiSelect
            hobits={(hobits ?? []).map((h) => ({
              slug: h.slug,
              name: h.name,
              tags: h.tags,
            }))}
            selected={selected}
            onToggle={toggle}
            emptyLabel={t("council.roster.no_hobits")}
          />
        </fieldset>
      </CardContent>
    </Card>
  );
}
