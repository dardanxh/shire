import {
  ActivityIcon,
  BookOpenIcon,
  BotIcon,
  CodeIcon,
  ExternalLinkIcon,
  GaugeIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  HistoryIcon,
  KeyRoundIcon,
  Layers2Icon,
  ListChecksIcon,
  Loader2Icon,
  MapIcon,
  MessageCircleQuestionIcon,
  NetworkIcon,
  PackageIcon,
  PuzzleIcon,
  ScaleIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepoJobsPanel } from "@/features/jobs";
import { RepoMergeReviewsPanel } from "@/features/merge-reviews";
import { RepoPrinciplesPanel } from "@/features/principles";
import { RepoRoadmapsPanel } from "@/features/roadmaps";
import { extractErrorMessage } from "@/lib/api";
import { useCrumbOverride } from "@/lib/crumb";
import {
  formatAge,
  formatDateTime,
  formatNumber,
  shortSha,
} from "@/lib/format";
import { isIngesting, useAnalysisQuery, useRepositoryQuery } from "../api";
import type { RepositoryTab } from "../tabs";
import { AiReadinessPanel } from "./AiReadinessPanel";
import { ArchitecturePanel } from "./ArchitecturePanel";
import { AskPanel } from "./AskPanel";
import { BranchesPanel } from "./BranchesPanel";
import { BranchSwitcher } from "./BranchSwitcher";
import { CicdPanel } from "./CicdPanel";
import { CodebaseOverviewPanel } from "./CodebaseOverviewPanel";
import { CommitsChart } from "./CommitsChart";
import { ContextPanel } from "./ContextPanel";
import { DependenciesPanel } from "./DependenciesPanel";
import { EnrichmentCards } from "./EnrichmentCards";
import { EvolutionPanel } from "./EvolutionPanel";
import { FactCard } from "./FactCard";
import { HobitsPanel } from "./HobitsPanel";
import { IntegrationsPanel } from "./integrations/IntegrationsPanel";
import { LanguageBars } from "./LanguageBars";
import { RatingBadge } from "./RatingBadge";
import { RepositoryActions } from "./RepositoryActions";
import { TechStackPanel } from "./TechStackPanel";
import { VulnerabilitiesTable } from "./VulnerabilitiesTable";

export function RepositoryViewPage({
  id,
  tab,
  onTabChange,
  selectedTool,
  onSelectTool,
}: {
  id: string;
  tab: RepositoryTab;
  onTabChange: (tab: RepositoryTab) => void;
  selectedTool: string | undefined;
  onSelectTool: (tool: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const {
    data: repo,
    isPending: repoPending,
    isError: repoError,
    error,
  } = useRepositoryQuery(id);
  const { data: analysis, isPending: analysisPending } = useAnalysisQuery(id);
  // Breadcrumb: "Repositories > <repo slug>" — the loaded name replaces the static leaf.
  useCrumbOverride(repo?.slug);

  if (repoPending || analysisPending) return <DetailSkeleton />;

  if (repoError || !repo) {
    return (
      <div className="space-y-4">
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <BranchSwitcher
              id={repo.id}
              slug={repo.slug}
              currentBranch={repo.current_branch}
              status={repo.status}
            />
            {repo.provider === "local" ? (
              // A filesystem path is information, not a destination — no dead link.
              <span className="max-w-md truncate text-xs select-all">
                {repo.url}
              </span>
            ) : (
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-xs hover:text-foreground hover:underline"
              >
                <span className="max-w-md truncate">{repo.url}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0" />
              </a>
            )}
          </div>
          <RepositoryActions
            id={repo.id}
            slug={repo.slug}
            watched={repo.watched}
          />
        </div>
        {repo.status === "failed" && repo.error ? (
          <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {repo.error}
          </Card>
        ) : null}
      </div>

      {/* Tabs stay visible (and clickable) while the repo initializes — content fills in
          via polling once the analysis lands. */}
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as RepositoryTab)}
      >
        <TabsList>
          <TabsTrigger value="overview">
            <GaugeIcon />
            {t("repositories.view.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="ask">
            <MessageCircleQuestionIcon />
            {t("repositories.view.tabs.ask")}
          </TabsTrigger>
          <TabsTrigger value="code">
            <CodeIcon />
            {t("repositories.view.tabs.code")}
          </TabsTrigger>
          <TabsTrigger value="architecture">
            <NetworkIcon />
            {t("repositories.view.tabs.architecture")}
          </TabsTrigger>
          <TabsTrigger value="tech-stack">
            <Layers2Icon />
            {t("repositories.view.tabs.tech_stack")}
          </TabsTrigger>
          <TabsTrigger value="ai-readiness">
            <SparklesIcon />
            {t("repositories.view.tabs.ai_readiness")}
          </TabsTrigger>
          <TabsTrigger value="activity">
            <ActivityIcon />
            {t("repositories.view.tabs.activity")}
          </TabsTrigger>
          <TabsTrigger value="evolution">
            <HistoryIcon />
            {t("repositories.view.tabs.evolution")}
          </TabsTrigger>
          <TabsTrigger value="branches">
            <GitBranchIcon />
            {t("repositories.view.tabs.branches")}
          </TabsTrigger>
          <TabsTrigger value="mrs">
            <GitPullRequestIcon />
            {t("repositories.view.tabs.mrs")}
          </TabsTrigger>
          <TabsTrigger value="cicd">
            <WorkflowIcon />
            {t("repositories.view.tabs.cicd")}
          </TabsTrigger>
          <TabsTrigger value="dependencies">
            <PackageIcon />
            {t("repositories.view.tabs.dependencies")}
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldIcon />
            {t("repositories.view.tabs.security")}
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <PuzzleIcon />
            {t("repositories.view.tabs.integrations")}
          </TabsTrigger>
          <TabsTrigger value="context">
            <BookOpenIcon />
            {t("repositories.view.tabs.context")}
          </TabsTrigger>
          <TabsTrigger value="hobits">
            <BotIcon />
            {t("repositories.view.tabs.hobits")}
          </TabsTrigger>
          <TabsTrigger value="principles">
            <ScaleIcon />
            {t("repositories.view.tabs.principles")}
          </TabsTrigger>
          <TabsTrigger value="roadmaps">
            <MapIcon />
            {t("repositories.view.tabs.roadmaps")}
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <ListChecksIcon />
            {t("repositories.view.tabs.jobs")}
          </TabsTrigger>
        </TabsList>

        {!analysis || !facts ? (
          <Card className="p-10 text-center">
            {isIngesting(repo) ? (
              <>
                <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
                <p className="mt-3 font-medium">
                  {t("repositories.view.initializing_title")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("repositories.view.initializing_body")}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  {t("repositories.view.pending_title")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("repositories.view.pending_body")}
                </p>
              </>
            )}
          </Card>
        ) : (
          <>
            <TabsContent value="ask">
              <AskPanel repoId={repo.id} />
            </TabsContent>

            <TabsContent value="tech-stack">
              <TechStackPanel repoId={repo.id} />
            </TabsContent>

            <TabsContent value="ai-readiness">
              <AiReadinessPanel repoId={repo.id} />
            </TabsContent>

            <TabsContent value="principles">
              <RepoPrinciplesPanel repositoryId={repo.id} />
            </TabsContent>

            <TabsContent value="roadmaps">
              <RepoRoadmapsPanel repositoryId={repo.id} />
            </TabsContent>

            <TabsContent value="jobs">
              <RepoJobsPanel repositoryId={repo.id} />
            </TabsContent>

            {/* Overview — the headline scorecard */}
            <TabsContent value="overview" className="space-y-6">
              <CodebaseOverviewPanel repoId={repo.id} />

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
            </TabsContent>

            {/* Code — metrics, languages, hotspots */}
            <TabsContent value="code" className="space-y-6">
              <EnrichmentCards enrichment={analysis.enrichment} />

              <Card>
                <CardHeader>
                  <CardTitle>
                    {t("repositories.view.languages_title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <LanguageBars languages={analysis.languages} />
                </CardContent>
              </Card>

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
            </TabsContent>

            {/* Architecture — on-demand Mermaid diagrams generated by a hobit */}
            <TabsContent value="architecture">
              <ArchitecturePanel repoId={repo.id} />
            </TabsContent>

            <TabsContent value="evolution">
              <EvolutionPanel repoId={repo.id} />
            </TabsContent>

            {/* Activity — commits, contributors, CI/CD */}
            <TabsContent value="activity" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("repositories.view.commits_title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CommitsChart activity={analysis.commit_activity} />
                </CardContent>
              </Card>

              {/* CI/CD used to sit beside this as a card; the CI/CD tab supersedes it. */}
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
            </TabsContent>

            {/* Branches — live view against the clone, independent of the analysis snapshot */}
            <TabsContent value="branches">
              <BranchesPanel repoId={repo.id} />
            </TabsContent>

            {/* MRs — merge reviews analyzed in this platform for this repo */}
            <TabsContent value="mrs">
              <RepoMergeReviewsPanel repoId={repo.id} />
            </TabsContent>

            {/* CI/CD — how a change gets from a branch to an environment */}
            <TabsContent value="cicd">
              <CicdPanel repoId={repo.id} />
            </TabsContent>

            {/* Dependencies */}
            <TabsContent value="dependencies">
              <DependenciesPanel repoId={repo.id} />
            </TabsContent>

            {/* Security — secrets, vulnerabilities, health */}
            <TabsContent value="security" className="space-y-6">
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
            </TabsContent>

            {/* Codebase graph */}
            {/* Integrations — catalog of tools + per-tool views */}
            <TabsContent value="integrations">
              <IntegrationsPanel
                repoId={repo.id}
                selectedTool={selectedTool}
                onSelectTool={onSelectTool}
              />
            </TabsContent>

            {/* Context — the precomputed, agent-ready snapshot of the repo */}
            <TabsContent value="context">
              <ContextPanel repoId={repo.id} />
            </TabsContent>

            {/* Hobits — the agents assigned to this repo, with run controls */}
            <TabsContent value="hobits">
              <HobitsPanel repoId={repo.id} />
            </TabsContent>
          </>
        )}
      </Tabs>

      {analysis ? (
        <p className="text-xs text-muted-foreground">
          {t("repositories.view.analyzed_meta", {
            when: formatDateTime(analysis.analyzed_at),
            sha: shortSha(analysis.commit_sha),
          })}
        </p>
      ) : null}
    </div>
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
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
