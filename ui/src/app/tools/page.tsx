"use client";

import { useEffect, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { getTools, type ToolStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getTools();
        if (active) {
          setTools(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load tools");
          setTools([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const availableCount = tools?.filter((t) => t.available).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analysis tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tools
            ? `${availableCount} of ${tools.length} external tools available`
            : "Loading…"}
        </p>
      </div>

      {error ? (
        <Card className="p-6 text-sm text-destructive">
          Could not reach the API: {error}
        </Card>
      ) : tools === null ? (
        <Card className="space-y-4 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="ml-auto h-5 w-64" />
            </div>
          ))}
        </Card>
      ) : tools.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No tools reported.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Install</TableHead>
                <TableHead>Homepage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        t.available
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                          : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
                      )}
                    >
                      {t.available ? "available" : "missing"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.version ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.purpose}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {t.install}
                    </code>
                  </TableCell>
                  <TableCell>
                    {t.homepage ? (
                      <a
                        href={t.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm hover:text-foreground hover:underline"
                      >
                        Link
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    ) : (
                      "—"
                    )}
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
