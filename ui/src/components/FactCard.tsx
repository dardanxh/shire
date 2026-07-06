import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function FactCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate text-2xl font-semibold tabular-nums">
          {value}
        </p>
        {sub ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
