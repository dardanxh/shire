"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GitCommitHorizontalIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { FactCard } from "@/components/FactCard";
import { CommitsChart } from "@/components/CommitsChart";
import { LanguageBars } from "@/components/LanguageBars";
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
import {
  ApiError,
  getAnalysis,
  getRepository,
  type AnalysisOut,
  type RepositoryOut,
} from "@/lib/api";
import {
  formatAge,
  formatDateTime,
  formatNumber,
  shortSha,
} from "@/lib/format";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      repo: RepositoryOut;
      analysis: AnalysisOut | null;
      analysisMissing: boolean;
    };

export default function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const repo = await getRepository(id);
        let analysis: AnalysisOut | null = null;
        let analysisMissing = false;
        try {
          analysis = await getAnalysis(id);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            analysisMissing = true;
          } else {
            throw err;
          }
        }
        if (active) {
          setState({ kind: "ready", repo, analysis, analysisMissing });
        }
      } catch (err) {
        if (active) {
          setState({
            kind: "error",
            message:
              err instanceof Error ? err.message : "Failed to load repository",
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (state.kind === "loading") {
    return <DetailSkeleton />;
  }

  if (state.kind === "error") {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="p-6 text-sm text-destructive">{state.message}</Card>
      </div>
    );
  }

  const { repo, analysis, analysisMissing } = state;
  const facts = analysis?.facts;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackLink />
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

      {analysisMissing || !analysis || !facts ? (
        <Card className="p-10 text-center">
          <p className="font-medium">Analysis pending / not available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No analysis has been produced for this repository yet.
          </p>
        </Card>
      ) : (
        <>
          {/* Facts */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <FactCard label="Age" value={formatAge(facts.age_days)} />
            <FactCard
              label="Commits"
              value={formatNumber(facts.commit_count)}
            />
            <FactCard
              label="Contributors"
              value={formatNumber(facts.contributor_count)}
            />
            <FactCard label="Total LOC" value={formatNumber(facts.loc_total)} />
            <FactCard
              label="Primary language"
              value={facts.primary_language ?? "—"}
            />
            <FactCard
              label="License"
              value={facts.license_spdx ?? "—"}
              sub={facts.license_name ?? undefined}
            />
            <FactCard
              label="Tests"
              value={facts.has_tests == null ? "—" : facts.has_tests ? "Yes" : "No"}
            />
            <FactCard
              label="Dependencies"
              value={formatNumber(facts.dependency_count)}
            />
          </section>

          {/* Commits + Languages */}
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Commits over time</CardTitle>
              </CardHeader>
              <CardContent>
                <CommitsChart activity={analysis.commit_activity} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Languages</CardTitle>
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
                <CardTitle>Dependencies</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-4">
                {analysis.dependencies.length === 0 ? (
                  <EmptyRow text="No dependencies detected." />
                ) : (
                  <div className="max-h-96 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>Ecosystem</TableHead>
                          <TableHead>Scope</TableHead>
                          <TableHead>Manifest</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.dependencies.map((dep, i) => (
                          <TableRow key={`${dep.name}-${dep.manifest_file}-${i}`}>
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
                                {dep.is_dev ? "dev" : "prod"}
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
                <CardTitle>Top contributors</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.contributors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No contributors found.
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
                          {formatNumber(c.commits)} commits
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
                <CardTitle>CI / CD</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.cicd.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No CI/CD configuration detected.
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
                <CardTitle>Hotspots</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pt-4">
                {analysis.hotspots.length === 0 ? (
                  <EmptyRow text="No hotspots computed." />
                ) : (
                  <div className="max-h-[32rem] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Path</TableHead>
                          <TableHead className="text-right">Churn</TableHead>
                          <TableHead className="text-right">Size</TableHead>
                          <TableHead className="text-right">Score</TableHead>
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

          <p className="text-xs text-muted-foreground">
            Analyzed {formatDateTime(analysis.analyzed_at)} · commit{" "}
            <span className="font-mono">{shortSha(analysis.commit_sha)}</span>
          </p>
        </>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      All repositories
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
