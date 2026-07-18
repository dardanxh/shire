import { SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { useDistillGuidanceMutation, useHobitGuidanceQuery } from "../api";

/** The hobit's standing guidance distilled from run feedback — the visible half of the
 * feedback cycle (the other half rides along invisibly in every run prompt). */
export function HobitGuidanceCard({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { data: guidance } = useHobitGuidanceQuery(slug);
  const { mutate: distill, isPending } = useDistillGuidanceMutation(slug);

  if (!guidance) return null;
  const distilling = guidance.distill_pending || isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" />
          {t("hobits.guidance.title")}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={distilling}
          onClick={() =>
            distill(undefined, {
              onSuccess: () => toast.success(t("hobits.guidance.toast_queued")),
            })
          }
        >
          {distilling
            ? t("hobits.guidance.pending")
            : t("hobits.guidance.distill_now")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {guidance.guidance ? (
          <>
            <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
              {guidance.guidance}
            </p>
            {guidance.last_distilled_at ? (
              <p className="text-xs text-muted-foreground">
                {t("hobits.guidance.meta", {
                  when: formatDateTime(guidance.last_distilled_at),
                  count: guidance.feedback_count,
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("hobits.guidance.empty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
