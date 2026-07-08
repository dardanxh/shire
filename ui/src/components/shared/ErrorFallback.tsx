import { AlertTriangleIcon } from "lucide-react";
import type { FallbackProps } from "react-error-boundary";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractErrorMessage } from "@/lib/api";

/** Friendly fallback for `react-error-boundary`. */
export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[50vh] place-items-center p-6">
      <Card className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <AlertTriangleIcon className="size-8 text-destructive" />
        <p className="font-medium">{t("common.states.error_title")}</p>
        <p className="text-sm text-muted-foreground">
          {extractErrorMessage(error)}
        </p>
        <Button variant="outline" onClick={resetErrorBoundary}>
          {t("common.actions.retry")}
        </Button>
      </Card>
    </div>
  );
}
