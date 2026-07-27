import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Multi-select filter as a dropdown of checkbox items; the trigger shows the active
 * count ("Tags (2)"). Pass a translated `label`; `optionClassName` styles the items
 * (e.g. "capitalize" for raw category values).
 */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
  optionClassName,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  optionClassName?: string;
}) {
  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((s) => s !== option)
        : [...selected, option],
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline">
            {label}
            {selected.length > 0 ? ` (${selected.length})` : ""}
            <ChevronDownIcon />
          </Button>
        }
      />
      <DropdownMenuContent className="max-h-72 min-w-40 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={selected.includes(option)}
            closeOnClick={false}
            onCheckedChange={() => toggle(option)}
            className={optionClassName}
          >
            {option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
