import { GavelIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CouncilTopicDetailOut } from "@/lib/api";

/** The chair's final recommendation — the debate's headline output. */
export function SynthesisCard({ topic }: { topic: CouncilTopicDetailOut }) {
  const { t } = useTranslation();
  const synthesis = topic.synthesis;
  if (!synthesis) return null;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <GavelIcon className="size-3.5" />
          {t("council.view.synthesis_title")}
        </p>
        <CardTitle className="text-lg">{synthesis.headline}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {synthesis.narrative}
        </p>
        {synthesis.key_disagreements.length > 0 ? (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("council.view.key_disagreements")}
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {synthesis.key_disagreements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
