import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/** Canonical presentation order for diagram kinds; unknown kinds sort last. */
export const DIAGRAM_KIND_ORDER = [
  "conceptual",
  "logical",
  "data_flow",
  "sequence",
  "stack_aws",
  "stack_azure",
  "stack_gcp",
  "stack_open_source",
  "stack_snowflake",
  "stack_databricks",
] as const;

export function sortDiagramKinds(kinds: string[]): string[] {
  const rank = (kind: string) => {
    const index = DIAGRAM_KIND_ORDER.indexOf(
      kind as (typeof DIAGRAM_KIND_ORDER)[number],
    );
    return index === -1 ? DIAGRAM_KIND_ORDER.length : index;
  };
  return [...kinds].sort((a, b) => rank(a) - rank(b));
}

/** Pill strip switching between an architecture's diagram views. */
export function DiagramTabs({
  kinds,
  active,
  onChange,
}: {
  kinds: string[];
  active: string;
  onChange: (kind: string) => void;
}) {
  const { t } = useTranslation();
  if (kinds.length <= 1) return null;
  const firstStack = kinds.find((kind) => kind.startsWith("stack_"));
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-0.5">
      {kinds.map((kind) => (
        <Fragment key={kind}>
          {/* Divider between the abstract views and the concrete tech stacks. */}
          {kind === firstStack && kind !== kinds[0] && (
            <span className="mx-0.5 h-4 w-px bg-border" />
          )}
          <button
            type="button"
            onClick={() => onChange(kind)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active === kind
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`blueprints.diagram.kind_${kind}`, { defaultValue: kind })}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
