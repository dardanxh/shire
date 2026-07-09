import { CopyIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useMemo } from "react";
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
import type { ArchitectureDiagram } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  useArchitectureQuery,
  useGenerateArchitectureDiagramMutation,
} from "../api";
import { MermaidDiagram } from "./MermaidDiagram";

// Display order of the category groups.
const CATEGORY_ORDER = ["Structural", "Behavioral", "Data"] as const;

export function ArchitecturePanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data } = useArchitectureQuery(repoId);
  const {
    mutate: generate,
    isPending,
    variables: generatingKind,
  } = useGenerateArchitectureDiagramMutation(repoId);

  const grouped = useMemo(() => {
    const diagrams = data?.diagrams ?? [];
    return CATEGORY_ORDER.map((category) => ({
      category,
      diagrams: diagrams.filter((d) => d.category === category),
    })).filter((g) => g.diagrams.length > 0);
  }, [data]);

  const agentAvailable = data?.agent_available ?? true;

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
      </div>

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
                diagram={diagram}
                busy={isPending && generatingKind === diagram.kind}
                disabled={isPending || !agentAvailable}
                onGenerate={() =>
                  generate(diagram.kind, {
                    onSuccess: () =>
                      toast.success(
                        t("repositories.view.architecture.toast", {
                          title: diagram.title,
                        }),
                      ),
                  })
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DiagramCard({
  diagram,
  busy,
  disabled,
  onGenerate,
}: {
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
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <MermaidDiagram code={diagram.mermaid} />
            </div>
            <DiagramSource code={diagram.mermaid} />
            {diagram.generated_at ? (
              <p className="text-xs text-muted-foreground">
                {t("repositories.view.architecture.generated_at", {
                  when: formatDateTime(diagram.generated_at),
                })}
              </p>
            ) : null}
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
