import { ExternalLinkIcon, Loader2Icon, NetworkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useGenerateGraphMutation, useGraphQuery } from "../api";

/**
 * Codebase-graph section: triggers emerge on the server and iframes the
 * generated interactive graph. The graph URL is a backend path; in a deployed
 * build it must be resolved against the API origin (dev goes through the Vite
 * proxy, so the prefix is empty).
 */
export function CodebaseGraph({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data: graph, isPending } = useGraphQuery(id);
  const { mutate: generate, isPending: generating } =
    useGenerateGraphMutation(id);

  const handleGenerate = () => {
    generate(undefined, {
      onSuccess: () => toast.success(t("repositories.view.graph_toast_done")),
    });
  };

  const toolAvailable = graph?.tool_available ?? false;
  const src = graph?.url ? `${env.VITE_API_BASE_URL}${graph.url}` : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <NetworkIcon className="size-4" />
            {t("repositories.view.graph_title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("repositories.view.graph_desc")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {src ? (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: "sm", variant: "ghost" })}
            >
              <ExternalLinkIcon className="size-3.5" />
              {t("repositories.view.graph_open")}
            </a>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={generating || isPending || !toolAvailable}
            onClick={handleGenerate}
          >
            {generating ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {generating
              ? t("repositories.view.graph_generating")
              : graph?.generated
                ? t("repositories.view.graph_regenerate")
                : t("repositories.view.graph_generate")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isPending && !toolAvailable ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>{t("repositories.view.graph_unavailable")}</p>
            <code className="mt-1 block font-mono text-xs">
              {t("repositories.view.graph_unavailable_hint")}
            </code>
          </div>
        ) : null}

        {src ? (
          <>
            <iframe
              key={graph?.generated_at ?? src}
              src={src}
              title={t("repositories.view.graph_title")}
              className="h-[70vh] w-full rounded-md border border-border bg-background"
            />
            <p className="text-xs text-muted-foreground">
              {t("repositories.view.graph_meta", {
                when: formatDateTime(graph?.generated_at ?? null),
                files: formatNumber(graph?.scanned_files ?? 0),
                nodes: formatNumber(graph?.node_count ?? 0),
              })}
            </p>
          </>
        ) : toolAvailable ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("repositories.view.graph_empty")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
