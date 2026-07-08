import { HistoryIcon, Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useCodeAgeQuery, useGenerateCodeAgeMutation } from "../api";

/**
 * Code age (git-of-theseus): a stacked-area SVG of how much code from each year
 * still survives. The tool renders the chart server-side; we show the image plus
 * a compact per-cohort breakdown.
 */
export function CodeAge({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data: codeAge, isPending } = useCodeAgeQuery(id);
  const { mutate: generate, isPending: generating } =
    useGenerateCodeAgeMutation(id);

  const handleGenerate = () => {
    generate(undefined, {
      onSuccess: () => toast.success(t("repositories.view.code_age_toast")),
    });
  };

  const available = codeAge?.tool_available ?? false;
  const src = codeAge?.url ? `${env.VITE_API_BASE_URL}${codeAge.url}` : null;
  const cohorts = codeAge?.cohorts ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" />
            {t("repositories.view.code_age_title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("repositories.view.code_age_desc")}
          </p>
        </div>
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
            : codeAge?.generated
              ? t("repositories.view.viz_regenerate")
              : t("repositories.view.viz_generate")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isPending && !available ? (
          <UnavailableNote
            message={t("repositories.view.code_age_unavailable")}
            hint="uv tool install git-of-theseus"
          />
        ) : null}

        {src ? (
          <>
            <img
              key={codeAge?.generated_at ?? src}
              src={src}
              alt={t("repositories.view.code_age_title")}
              className="w-full rounded-md border border-border bg-white"
            />
            {cohorts.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {cohorts
                  .slice()
                  .reverse()
                  .map((c) => (
                    <div
                      key={c.label}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-muted-foreground">
                        {c.label.replace("Code added in ", "")}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatNumber(c.lines)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("repositories.view.viz_generated_at", {
                when: formatDateTime(codeAge?.generated_at ?? null),
              })}
            </p>
          </>
        ) : available ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("repositories.view.code_age_empty")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UnavailableNote({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
      <p>{message}</p>
      <code className="mt-1 block font-mono text-xs">{hint}</code>
    </div>
  );
}
