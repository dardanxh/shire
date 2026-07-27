import { ArrowUpDownIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortOption = { value: string; label: string };

/**
 * Compact sort picker for card views. Each view passes the sort keys that apply to
 * its cards (name, recently added, price, time to value, …) with translated labels.
 */
export function SortMenu({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  options: SortOption[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="h-8 w-40 text-xs" aria-label={label}>
        <ArrowUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
