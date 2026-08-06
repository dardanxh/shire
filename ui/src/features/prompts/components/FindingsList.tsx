import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  OctagonAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PromptFinding } from "@/lib/api";

const SEVERITY_ORDER = ["blocker", "warn", "info"] as const;

const SEVERITY_META = {
  blocker: { variant: "destructive", icon: OctagonAlertIcon },
  warn: { variant: "warning", icon: AlertTriangleIcon },
  info: { variant: "secondary", icon: InfoIcon },
} as const;

/**
 * The findings panel.
 *
 * Every finding carries its own "why this matters" from the backend rather than the UI keeping a
 * parallel copy — a rule and its rationale drift apart the moment they live in two places.
 */
export function FindingsList({ findings }: { findings: PromptFinding[] }) {
  const { t } = useTranslation();

  if (findings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2Icon className="size-8 text-success" />
          <p className="font-medium">{t("prompts.checks.clean_title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("prompts.checks.clean_body")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const grouped = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: findings.filter((finding) => finding.severity === severity),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ severity, items }) => {
        const meta = SEVERITY_META[severity];
        const Icon = meta.icon;
        return (
          <section key={severity} className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4" />
              {t(`prompts.checks.severity.${severity}`)}
              <Badge variant={meta.variant}>{items.length}</Badge>
            </h3>
            {items.map((finding) => (
              <Card key={finding.rule_id}>
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{finding.title}</span>
                    <Badge variant="outline">
                      {t(`prompts.checks.dimension.${finding.dimension}`)}
                    </Badge>
                    {finding.occurrences > 1 ? (
                      <Badge variant="ghost">
                        {t("prompts.checks.occurrences", {
                          count: finding.occurrences,
                        })}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm">{finding.detail}</p>
                  {finding.evidence ? (
                    <code className="w-fit max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {finding.evidence}
                    </code>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {finding.why_it_matters}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        );
      })}
    </div>
  );
}
