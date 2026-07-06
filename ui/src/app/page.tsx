"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, GitBranchIcon } from "lucide-react";
import { AddRepositoryDialog } from "@/components/AddRepositoryDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRepositories, type RepositoryOut } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function HomePage() {
  const [repos, setRepos] = useState<RepositoryOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listRepositories();
      setRepos(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load repositories",
      );
      setRepos([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await listRepositories();
        if (active) {
          setRepos(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load repositories",
          );
          setRepos([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Repositories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {repos ? `${repos.length} tracked` : "Loading…"}
          </p>
        </div>
        <AddRepositoryDialog onAdded={() => void load()} />
      </div>

      {error ? (
        <Card className="p-6 text-sm text-destructive">
          Could not reach the API: {error}
        </Card>
      ) : repos === null ? (
        <ListSkeleton />
      ) : repos.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <GitBranchIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">No repositories yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add a git repository to clone and analyze it.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Last analyzed</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {repos.map((repo) => (
                <TableRow
                  key={repo.id}
                  className="group cursor-pointer"
                  onClick={() => {
                    window.location.href = `/repositories/${repo.id}`;
                  }}
                >
                  <TableCell>
                    <Link
                      href={`/repositories/${repo.id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {repo.slug}
                    </Link>
                    {repo.status === "failed" && repo.error ? (
                      <p className="mt-0.5 max-w-md truncate text-xs text-destructive">
                        {repo.error}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {repo.provider}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={repo.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {repo.default_branch}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(repo.last_analyzed_at)}
                  </TableCell>
                  <TableCell>
                    <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <Card className="space-y-4 p-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="ml-auto h-5 w-24" />
        </div>
      ))}
    </Card>
  );
}
