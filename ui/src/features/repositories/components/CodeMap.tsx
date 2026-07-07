import { Building2Icon, ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useCodeMapQuery, useGenerateCodeMapMutation } from "../api";

/**
 * CodeCharta "code city": files as buildings sized/colored by metrics. The map
 * is generated server-side (ccsh) and rendered in CodeCharta's own browser
 * viewer, which we iframe with the map pre-loaded via a `?file=` URL.
 */
export function CodeMap({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data: codeMap, isPending } = useCodeMapQuery(id);
  const { mutate: generate, isPending: generating } =
    useGenerateCodeMapMutation(id);

  const handleGenerate = () => {
    generate(undefined, {
      onSuccess: () => toast.success(t("repositories.view.code_map_toast")),
    });
  };

  const available = codeMap?.tool_available ?? false;
  const viewerAvailable = codeMap?.viewer_available ?? false;
  const src = codeMap?.url ? `${env.VITE_API_BASE_URL}${codeMap.url}` : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Building2Icon className="size-4" />
            {t("repositories.view.code_map_title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("repositories.view.code_map_desc")}
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
              {t("repositories.view.viz_open")}
            </a>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={generating || isPending || !available}
            onClick={handleGenerate}
          >
            {generating ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {generating
              ? t("repositories.view.viz_generating")
              : codeMap?.generated
                ? t("repositories.view.viz_regenerate")
                : t("repositories.view.viz_generate")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isPending && !available ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>{t("repositories.view.code_map_unavailable")}</p>
            <code className="mt-1 block font-mono text-xs">
              npm install -g codecharta-analysis codecharta-visualization
            </code>
          </div>
        ) : null}

        {codeMap?.generated && !viewerAvailable ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t("repositories.view.code_map_no_viewer")}
          </div>
        ) : null}

        {src ? (
          <>
            <iframe
              key={codeMap?.generated_at ?? src}
              src={src}
              title={t("repositories.view.code_map_title")}
              className="h-[70vh] w-full rounded-md border border-border bg-background"
            />
            <p className="text-xs text-muted-foreground">
              {t("repositories.view.code_map_meta", {
                when: formatDateTime(codeMap?.generated_at ?? null),
                files: formatNumber(codeMap?.file_count ?? 0),
              })}
            </p>
          </>
        ) : available ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("repositories.view.code_map_empty")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
