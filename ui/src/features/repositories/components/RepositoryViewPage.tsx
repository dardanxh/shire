import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GitCommitHorizontalIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extractErrorMessage } from "@/lib/api";
import {
  formatAge,
  formatDateTime,
  formatNumber,
  shortSha,
} from "@/lib/format";
import { useAnalysisQuery, useRepositoryQuery } from "../api";
import { CommitsChart } from "./CommitsChart";
import { EnrichmentCards } from "./EnrichmentCards";
import { FactCard } from "./FactCard";
import { LanguageBars } from "./LanguageBars";
import { RatingBadge } from "./RatingBadge";
import { RepositoryActions } from "./RepositoryActions";
import { StatusBadge } from "./StatusBadge";
import { ToolRuns } from "./ToolRuns";
import { VulnerabilitiesTable } from "./VulnerabilitiesTable";

export function RepositoryViewPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const {
    data: repo,
    isPending: repoPending,
    isError: repoError,
    error,
  } = useRepositoryQuery(id);
  const { data: analysis, isPending: analysisPending } = useAnalysisQuery(id);

  if (repoPending || analysisPending) return <DetailSkeleton />;

  if (repoError || !repo) {
    return (
      <div className="space-y-4">
        <BackLink label={t("repositories.view.back")} />
        <Card className="p-6 text-sm text-destructive">
          {error
            ? extractErrorMessage(error)
            : t("repositories.view.load_error")}
        </Card>
      </div>
    );
  }

  const facts = analysis?.facts;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackLink label={t("repositories.view.back")} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {repo.slug}
              </h1>
              <StatusBadge status={repo.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="capitalize">{repo.provider}</span>
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                {repo.url}
                <ExternalLinkIcon className="size-3.5" />
              </a>
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                <GitCommitHorizontalIcon className="size-3.5" />
                {shortSha(repo.last_analyzed_commit)}
              </span>
              <span className="font-mono text-xs">{repo.default_branch}</span>
            </div>
          </div>
        </div>
        {repo.status === "failed" && repo.error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {repo.error}
          </Card>
        ) : null}
      </div>

      <RepositoryActions id={repo.id} toolRuns={analysis?.tool_runs ?? []} />

      {!analysis || !facts ? (
        <Card className="p-10 text-center">
          <p className="font-medium">{t("repositories.view.pending_title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("repositories.view.pending_body")}
          </p>
        </Card>
      ) : (
        <>
          {/* Facts */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <FactCard
              label={t("repositories.view.facts.age")}
              value={formatAge(facts.age_days)}
            />
            <FactCard
              label={t("repositories.view.facts.commits")}
              value={formatNumber(facts.commit_count)}
            />
            <FactCard
              label={t("repositories.view.facts.contributors")}
              value={formatNumber(facts.contributor_count)}
            />
            <FactCard
              label={t("repositories.view.facts.loc")}
              value={formatNumber(facts.loc_total)}
            />
            <FactCard
              label={t("repositories.view.facts.primary_language")}
              value={facts.primary_language ?? "—"}
            />
            <FactCard
              label={t("repositories.view.facts.license")}
              value={facts.license_spdx ?? "—"}
              sub={facts.license_name ?? undefined}
            />
            <FactCard
              label={t("repositories.view.facts.tests")}
              value={
                facts.has_tests == null
                  ? "—"
                  : facts.has_tests
                    ? t("repositories.view.facts.tests_yes")
                    : t("repositories.view.facts.tests_no")
              }
            />
            <FactCard
              label={t("repositories.view.facts.dependencies")}
              value={formatNumber(facts.dependency_count)}
            />
          </section>

          {/* Ratings */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RatingBadge
              label={t("repositories.view.ratings.maintainability")}
              rating={analysis.enrichment.ratings?.maintainability ?? "NA"}
            />
            <RatingBadge
              label={t("repositories.view.ratings.security")}
              rating={analysis.enrichment.ratings?.security ?? "NA"}
            />
            <RatingBadge
              label={t("repositories.view.ratings.health")}
              rating={analysis.enrichment.ratings?.health ?? "NA"}
            />
          </section>

          {/* Code metrics */}
          <EnrichmentCards enrichment={analysis.enrichment} />

          {/* Secrets */}
          <section>
            {analysis.enrichment.secret_count > 0 ? (
              <Card className="flex flex-row items-center gap-3 border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                <KeyRoundIcon className="size-5 shrink-0" />
                <span>
                  {t("repositories.view.secrets.detected", {
                    count: analysis.enrichment.secret_count,
                  })}
                </span>
              </Card>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                {t("repositories.view.secrets.none")}
              </p>
            )}
          </section>

          {/* Commits + Languages */}
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("repositories.view.commits_title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CommitsChart activity={analysis.commit_activity} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("repositories.view.languages_title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <LanguageBars languages={analysis.languages} />
              </CardContent>
            </Card>
          </section>

          {/* Dependencies + Contributors */}
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 overflow-hidden p-0">
              <CardHeader className="p-6 pb-0">
                <CardTitle>
                  {t("repositories.view.dependencies_title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-4">
                {analysis.dependencies.length === 0 ? (
                  <EmptyRow text={t("repositories.view.dependencies_empty")} />
                ) : (
                  <div className="max-h-96 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            {t("repositories.view.dep_name")}
                          </TableHead>
                          <TableHead>
                            {t("repositories.view.dep_version")}
                          </TableHead>
                          <TableHead>
                            {t("repositories.view.dep_ecosystem")}
                          </TableHead>
                          <TableHead>
                            {t("repositories.view.dep_scope")}
                          </TableHead>
                          <TableHead>
                            {t("repositories.view.dep_manifest")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.dependencies.map((dep, i) => (
                          <TableRow
                            key={`${dep.name}-${dep.manifest_file}-${i}`}
                          >
                            <TableCell className="font-medium">
                              {dep.name}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {dep.version ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {dep.ecosystem}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={dep.is_dev ? "secondary" : "outline"}
                              >
                                {dep.is_dev
                                  ? t("repositories.view.dep_dev")
                                  : t("repositories.view.dep_prod")}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {dep.manifest_file ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t("repositories.view.contributors_title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.contributors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("repositories.view.contributors_empty")}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {analysis.contributors.slice(0, 8).map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {t("repositories.view.contributor_commits", {
                            count: c.commits,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          {/* CI/CD */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>{t("repositories.view.cicd_title")}</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.cicd.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("repositories.view.cicd_empty")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {analysis.cicd.map((c) => (
                      <div
                        key={c.system}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Badge className="capitalize">{c.system}</Badge>
                        {c.config_files.map((f) => (
                          <span
                            key={f}
                            className="font-mono text-xs text-muted-foreground"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Hotspots */}
          <section>
            <Card className="overflow-hidden p-0">
              <CardHeader className="p-6 pb-0">
                <CardTitle>{t("repositories.view.hotspots_title")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-4">
                {analysis.hotspots.length === 0 ? (
                  <EmptyRow text={t("repositories.view.hotspots_empty")} />
                ) : (
                  <div className="max-h-[32rem] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            {t("repositories.view.hotspot_path")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("repositories.view.hotspot_churn")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("repositories.view.hotspot_size")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("repositories.view.hotspot_score")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.hotspots.map((h, i) => (
                          <TableRow key={`${h.path}-${i}`}>
                            <TableCell className="font-mono text-xs">
                              {h.path}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(h.churn)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(h.size)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {h.score.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Vulnerabilities */}
          <section>
            <Card className="overflow-hidden p-0">
              <CardHeader className="p-6 pb-0">
                <CardTitle>
                  {t("repositories.view.vulns_title")}
                  {analysis.vulnerabilities.length > 0 ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({analysis.vulnerabilities.length})
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-4">
                {analysis.vulnerabilities.length === 0 ? (
                  <p className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground">
                    <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                    {t("repositories.view.vulns_none")}
                  </p>
                ) : (
                  <VulnerabilitiesTable
                    vulnerabilities={analysis.vulnerabilities}
                  />
                )}
              </CardContent>
            </Card>
          </section>

          {/* Health checks */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>{t("repositories.view.health_title")}</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.health_checks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("repositories.view.health_empty")}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {analysis.health_checks.map((h) => (
                      <li key={h.name} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{h.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {t("repositories.view.health_score", {
                              score: h.score,
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {h.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Analysis tools */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>{t("repositories.view.tools_title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ToolRuns toolRuns={analysis.tool_runs} />
              </CardContent>
            </Card>
          </section>

          <p className="text-xs text-muted-foreground">
            {t("repositories.view.analyzed_meta", {
              when: formatDateTime(analysis.analyzed_at),
              sha: shortSha(analysis.commit_sha),
            })}
          </p>
        </>
      )}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/"
      search={{ page: 1, size: 20 }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      {label}
    </Link>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-6 pb-6 text-sm text-muted-foreground">{text}</p>;
}

function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
