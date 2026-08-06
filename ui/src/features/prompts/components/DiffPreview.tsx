import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { DiffHunk } from "../diff";

/**
 * The old text with the rewrite laid over it: additions in yellow, removals struck through.
 *
 * Every changed run is a button — click the highlight to reject that change, click again to take it
 * back. That keeps the accept/reject controls exactly where the change is, instead of in a
 * numbered list the reader has to cross-reference against the text.
 */
export function DiffPreview({
  hunks,
  accepted,
  onToggle,
}: {
  hunks: DiffHunk[];
  accepted: ReadonlySet<number>;
  onToggle: (id: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-4 font-mono text-xs leading-relaxed">
      {hunks.map((hunk) => {
        if (hunk.op === "equal") {
          return <span key={hunk.id}>{hunk.before}</span>;
        }

        const isAccepted = accepted.has(hunk.id);
        const label = isAccepted
          ? t("prompts.suggestions.reject_this")
          : t("prompts.suggestions.accept_this");

        return (
          <button
            key={hunk.id}
            type="button"
            onClick={() => onToggle(hunk.id)}
            aria-pressed={isAccepted}
            title={label}
            className={cn(
              "cursor-pointer rounded text-left align-baseline transition-opacity hover:opacity-80",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              // A rejected change is shown as the original, dimmed, so it stays visible as a
              // decision you made rather than vanishing from the page.
              !isAccepted && "opacity-50",
            )}
          >
            {hunk.before && isAccepted ? (
              <span className="bg-destructive/10 text-destructive line-through">
                {hunk.before}
              </span>
            ) : null}
            {!isAccepted ? <span>{hunk.before}</span> : null}
            {hunk.after && isAccepted ? (
              <span className="bg-warning/25 text-foreground">
                {hunk.after}
              </span>
            ) : null}
          </button>
        );
      })}
    </pre>
  );
}
