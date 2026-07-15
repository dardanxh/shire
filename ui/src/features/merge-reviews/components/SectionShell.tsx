import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

/**
 * Wraps one analysis section of the detail page. While the background pipeline
 * works (pending/running) it shows the section-appropriate skeleton with a
 * pulsing badge; failed sections show a quiet inline error; completed renders
 * the children. The polling detail query re-renders this as statuses flip.
 */
export function SectionShell({
  status,
  skeleton,
  children,
}: {
  status: string;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  if (status === "pending" || status === "running") {
    return (
      <div className="relative">
        {skeleton}
        <Badge
          variant="secondary"
          className="absolute right-0 top-0 animate-pulse"
        >
          {t("merge_reviews.section.analyzing")}
        </Badge>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        {t("merge_reviews.section.failed")}
      </p>
    );
  }
  return <>{children}</>;
}
