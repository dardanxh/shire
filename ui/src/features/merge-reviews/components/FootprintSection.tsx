import { FlameIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MergeReviewFootprint } from "@/lib/api";
import { DirectoryHeatmap } from "./DirectoryHeatmap";
import { FootprintBarChart } from "./FootprintBarChart";

/**
 * Layer 4 — the git footprint. Everything here is computed synchronously at
 * create time, so this whole layer paints on first load while the AI layers
 * above and below are still polling in.
 */
export function FootprintSection({
  footprint,
}: {
  footprint: MergeReviewFootprint;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("merge_reviews.footprint.files_title")}
          </CardTitle>
          <CardDescription>
            {t("merge_reviews.footprint.files_subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FootprintBarChart footprint={footprint} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("merge_reviews.footprint.heatmap_title")}
          </CardTitle>
          <CardDescription>
            {t("merge_reviews.footprint.heatmap_subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DirectoryHeatmap footprint={footprint} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <AuthorsCard footprint={footprint} />
        <TestsBalanceCard footprint={footprint} />
        <HotspotOverlapCard footprint={footprint} />
      </div>
    </div>
  );
}

function AuthorsCard({ footprint }: { footprint: MergeReviewFootprint }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon className="size-4 text-muted-foreground" />
          {t("merge_reviews.footprint.authors_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tabular-nums">
          {footprint.author_count}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("merge_reviews.footprint.authors_commits", {
            count: footprint.commit_count,
          })}
        </p>
        <ul className="space-y-1">
          {footprint.authors.map((author) => (
            <li key={author} className="flex items-center gap-2 text-sm">
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold uppercase"
                aria-hidden
              >
                {author.slice(0, 1)}
              </span>
              <span className="truncate">{author}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TestsBalanceCard({ footprint }: { footprint: MergeReviewFootprint }) {
  const { t } = useTranslation();
  const code = footprint.code_lines_changed;
  const tests = footprint.test_lines_changed;
  const total = code + tests;
  const noTests = code > 0 && tests === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("merge_reviews.footprint.tests_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total > 0 ? (
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-[var(--chart-1)]"
              style={{ width: `${(code / total) * 100}%` }}
            />
            <div
              className="h-full bg-[var(--success)]"
              style={{ width: `${(tests / total) * 100}%` }}
            />
          </div>
        ) : null}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {code} {t("merge_reviews.footprint.tests_code_lines")}
          </span>
          <span className="tabular-nums">
            {tests} {t("merge_reviews.footprint.tests_test_lines")}
          </span>
        </div>
        {noTests ? (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--warning)]">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            {t("merge_reviews.footprint.tests_warning")}
          </p>
        ) : code === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("merge_reviews.footprint.tests_only")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HotspotOverlapCard({
  footprint,
}: {
  footprint: MergeReviewFootprint;
}) {
  const { t } = useTranslation();
  const hotspots = footprint.hotspot_paths_touched;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlameIcon
            className={
              hotspots.length
                ? "size-4 text-[var(--warning)]"
                : "size-4 text-muted-foreground"
            }
          />
          {t("merge_reviews.footprint.hotspots_title")}
        </CardTitle>
        <CardDescription>
          {t("merge_reviews.footprint.hotspots_body")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hotspots.length === 0 ? (
          <p className="text-sm text-[var(--success)]">
            {t("merge_reviews.footprint.hotspots_none")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {hotspots.map((path) => (
              <li
                key={path}
                className="flex items-center gap-2 text-xs"
                title={path}
              >
                <FlameIcon className="size-3.5 shrink-0 text-[var(--warning)]" />
                <span className="truncate font-mono">{path}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
