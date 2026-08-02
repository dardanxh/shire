import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CopyIcon,
  Loader2Icon,
  Maximize2Icon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isJobSettled, useJobQuery } from "@/features/jobs";
import type { ArchitectureDiagram, JobDetailOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  useArchitectureQuery,
  useGenerateArchitectureDiagramMutation,
} from "../api";
import { repositoryKeys } from "../keys";
import { ArtifactVersionHistory } from "./ArtifactVersionHistory";
import { MermaidDiagram } from "./MermaidDiagram";

// Display order of the category groups.
const CATEGORY_ORDER = ["Structural", "Behavioral", "Data"] as const;

export function ArchitecturePanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useArchitectureQuery(repoId);
  const { mutate: generate } = useGenerateArchitectureDiagramMutation(repoId);
  // Per-kind in-flight state: kind -> engine job id (null while the enqueue request runs).
  // Diagrams generate independently — one running job never blocks the other cards.
  const [jobsByKind, setJobsByKind] = useState<Record<string, string | null>>(
    {},
  );

  const startGenerate = (diagram: ArchitectureDiagram) => {
    if (diagram.kind in jobsByKind) return; // already queueing/generating
    setJobsByKind((m) => ({ ...m, [diagram.kind]: null }));
    generate(diagram.kind, {
      onSuccess: (job) => {
        toast.success(
          t("repositories.view.architecture.toast", { title: diagram.title }),
        );
        setJobsByKind((m) => ({ ...m, [diagram.kind]: job.id }));
      },
      onError: () => {
        setJobsByKind((m) => {
          const { [diagram.kind]: _dropped, ...rest } = m;
          return rest;
        });
      },
    });
  };

  const onJobSettled = (kind: string, job: JobDetailOut) => {
    setJobsByKind((m) => {
      const { [kind]: _dropped, ...rest } = m;
      return rest;
    });
    queryClient.invalidateQueries({
      queryKey: repositoryKeys.architecture(repoId),
    });
    if (job.status === "succeeded") {
      toast.success(t("repositories.view.architecture.toast_done"));
    } else {
      toast.error(
        job.error ?? t("repositories.view.architecture.toast_failed"),
      );
    }
  };

  const grouped = useMemo(() => {
    const diagrams = data?.diagrams ?? [];
    return CATEGORY_ORDER.map((category) => ({
      category,
      diagrams: diagrams.filter((d) => d.category === category),
    })).filter((g) => g.diagrams.length > 0);
  }, [data]);

  const agentAvailable = data?.agent_available ?? true;
  // "Generate all" targets diagrams that don't exist yet and aren't already in flight —
  // regenerating existing ones stays a deliberate per-card action (it costs tokens).
  const missing = (data?.diagrams ?? []).filter(
    (d) => !d.generated && !(d.kind in jobsByKind),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">
          {t("repositories.view.tabs.architecture")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("repositories.view.architecture.desc")}
        </p>
        {!agentAvailable ? (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
            {t("repositories.view.architecture.unavailable")}
          </p>
        ) : null}
        <div className="mt-3">
          <Button
            size="sm"
            disabled={!agentAvailable || missing.length === 0}
            onClick={() => missing.forEach(startGenerate)}
          >
            <SparklesIcon className="size-3.5" />
            {missing.length > 0
              ? t("repositories.view.architecture.generate_all", {
                  count: missing.length,
                })
              : t("repositories.view.architecture.generate_all_done")}
          </Button>
        </div>
      </div>

      {Object.entries(jobsByKind).map(([kind, jobId]) =>
        jobId ? (
          <DiagramJobWatcher
            key={kind}
            jobId={jobId}
            onSettled={(job) => onJobSettled(kind, job)}
          />
        ) : null,
      )}

      {grouped.map((group) => (
        <section key={group.category} className="flex flex-col gap-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(
              `repositories.view.architecture.cat_${group.category.toLowerCase()}`,
            )}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {group.diagrams.map((diagram) => (
              <DiagramCard
                key={diagram.kind}
                repoId={repoId}
                diagram={diagram}
                busy={diagram.kind in jobsByKind}
                disabled={diagram.kind in jobsByKind || !agentAvailable}
                onGenerate={() => startGenerate(diagram)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Renderless: follows one diagram-generation job and reports back when it settles.
 * Mounted once per in-flight kind so any number of generations run concurrently. */
function DiagramJobWatcher({
  jobId,
  onSettled,
}: {
  jobId: string;
  onSettled: (job: JobDetailOut) => void;
}) {
  const { data: job } = useJobQuery(jobId);
  const settled = useRef(false);
  const callback = useRef(onSettled);
  callback.current = onSettled;
  // Side effect: hand the settled job to the parent exactly once (the parent then unmounts us).
  useEffect(() => {
    if (!settled.current && job && job.id === jobId && isJobSettled(job)) {
      settled.current = true;
      callback.current(job);
    }
  }, [job, jobId]);
  return null;
}

function DiagramCard({
  repoId,
  diagram,
  busy,
  disabled,
  onGenerate,
}: {
  repoId: string;
  diagram: ArchitectureDiagram;
  busy: boolean;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{diagram.title}</CardTitle>
          <CardDescription>{diagram.description}</CardDescription>
        </div>
        <Button
          size="sm"
          variant={diagram.generated ? "outline" : "default"}
          disabled={disabled}
          onClick={onGenerate}
        >
          {busy ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="size-3.5" />
          )}
          {busy
            ? t("repositories.view.architecture.generating")
            : diagram.generated
              ? t("repositories.view.architecture.regenerate")
              : t("repositories.view.architecture.generate")}
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {diagram.mermaid ? (
          <div className="flex flex-col gap-3">
            <Link
              to="/diagram/$repoId/$kind"
              params={{ repoId, kind: diagram.kind }}
              title={t("repositories.view.architecture.open")}
              className="group relative block rounded-md border border-border bg-muted/30 p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              <span className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2Icon className="size-3" />
                {t("repositories.view.architecture.open")}
              </span>
              {/* Non-interactive preview: the Link owns the click; pan/zoom lives on the full page. */}
              <div className="pointer-events-none max-h-72 overflow-hidden">
                <MermaidDiagram code={diagram.mermaid} />
              </div>
            </Link>
            <DiagramSource code={diagram.mermaid} />
            {diagram.generated_at ? (
              <p className="text-xs text-muted-foreground">
                {t("repositories.view.architecture.generated_at", {
                  when: formatDateTime(diagram.generated_at),
                })}
              </p>
            ) : null}
            <ArtifactVersionHistory
              repoId={repoId}
              artifact="architecture"
              kind={diagram.kind}
              renderContent={(version) =>
                typeof version.content.mermaid === "string" ? (
                  <div className="max-h-72 overflow-auto rounded-md bg-muted/30 p-3">
                    <MermaidDiagram code={version.content.mermaid} />
                  </div>
                ) : null
              }
            />
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("repositories.view.architecture.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DiagramSource({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <details className="group text-xs">
      <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground">
        {t("repositories.view.architecture.view_source")}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          onClick={(e) => {
            e.preventDefault();
            navigator.clipboard
              .writeText(code)
              .then(() =>
                toast.success(t("repositories.view.architecture.copied")),
              );
          }}
        >
          <CopyIcon className="size-3" />
          {t("repositories.view.architecture.copy")}
        </Button>
      </summary>
      <pre className="mt-2 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono leading-relaxed">
        {code}
      </pre>
    </details>
  );
}
