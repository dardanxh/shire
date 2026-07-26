import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type CheckboxListItem = {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

/** A scrollable list of checkbox rows, controlled by a Set of selected values. */
export function CheckboxList({
  items,
  selected,
  onToggle,
  emptyLabel,
}: {
  items: CheckboxListItem[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">{emptyLabel ?? "—"}</p>
    );
  }
  return (
    <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {items.map((item) => (
        <div
          key={item.value}
          className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
        >
          <Checkbox
            id={`checkbox-list-${item.value}`}
            checked={selected.has(item.value)}
            disabled={item.disabled}
            onCheckedChange={() => onToggle(item.value)}
          />
          <Label
            htmlFor={`checkbox-list-${item.value}`}
            className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 font-normal"
          >
            <span className="font-medium">{item.label}</span>
            {item.hint ? (
              <span className="text-xs text-muted-foreground">{item.hint}</span>
            ) : null}
          </Label>
        </div>
      ))}
    </div>
  );
}
