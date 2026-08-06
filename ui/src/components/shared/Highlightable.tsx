import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Marks agent-written prose that isn't rendered through `<Markdown>` (which carries the same
 * attribute itself) as highlightable, so selecting text inside it offers the Highlight button.
 * Wrap the prose, not the whole card — the attribute is what decides whether a selection
 * counts, and a card would sweep in labels, badges and timestamps.
 */
export function Highlightable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-highlightable="true" className={cn(className)}>
      {children}
    </div>
  );
}
