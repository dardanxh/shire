import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled card whose body toggles open/closed. Used for long text blocks the user drills
 * into on demand (job prompts/results, council takes).
 */
export function CollapsibleBlock({
  title,
  content,
  emptyLabel,
  defaultOpen,
  titleAccessory,
  variant = "default",
}: {
  title: string;
  content: string | null;
  emptyLabel?: string;
  defaultOpen: boolean;
  titleAccessory?: ReactNode;
  variant?: "default" | "destructive";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card
      className={cn(
        "p-0",
        variant === "destructive" && "border-destructive/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-5 py-3.5 text-sm font-semibold"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        {titleAccessory}
      </button>
      {open ? (
        <div className="border-t border-border px-5 py-4">
          {content ? (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {content}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">{emptyLabel ?? "—"}</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
