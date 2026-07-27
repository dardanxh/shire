import { LayoutGridIcon } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * How many cards a grid view shows per row. Default "auto": the grid packs as many
 * ~300px-wide cards as the screen fits, left-aligned, capped at 6 per row (each track
 * is forced ≥16% wide). Manual 3–6 overrides are available. One global,
 * localStorage-persisted preference shared by every card view.
 */
const STORAGE_KEY = "shire.card-columns";
const OPTIONS = ["auto", 3, 4, 5, 6] as const;
export type CardColumns = (typeof OPTIONS)[number];

// Static class strings per option — Tailwind can't see interpolated class names.
const GRID_CLASSES: Record<CardColumns, string> = {
  auto: "grid gap-4 grid-cols-[repeat(auto-fill,minmax(max(300px,16%),1fr))]",
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  5: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5",
  6: "grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
};

function stored(): CardColumns {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "auto" || raw === null) return "auto";
  const n = Number(raw);
  return (OPTIONS as readonly (string | number)[]).includes(n)
    ? (n as CardColumns)
    : "auto";
}

/** [gridClassName, columns, setColumns] for a card view. */
export function useCardColumns() {
  const [columns, setColumns] = useState<CardColumns>(stored);
  const update = (next: CardColumns) => {
    setColumns(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };
  return [GRID_CLASSES[columns], columns, update] as const;
}

/** Compact per-row picker for card grids. Pass translated `label`/`autoLabel` for a11y. */
export function CardColumnsSelect({
  columns,
  onChange,
  label,
  autoLabel,
}: {
  columns: CardColumns;
  onChange: (next: CardColumns) => void;
  label: string;
  autoLabel: string;
}) {
  return (
    <Select
      value={String(columns)}
      onValueChange={(v) =>
        v && onChange(v === "auto" ? "auto" : (Number(v) as CardColumns))
      }
    >
      <SelectTrigger className="h-8 w-24 text-xs" aria-label={label}>
        <LayoutGridIcon className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n === "auto" ? autoLabel : n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
