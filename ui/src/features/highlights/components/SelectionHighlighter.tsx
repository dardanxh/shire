import { HighlighterIcon, Loader2Icon } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useHighlightableSelection } from "@/hooks/use-text-selection";
import { useCreateHighlightMutation } from "../api";
import { useHighlightSource } from "../source";

/** Gap between the selection and the button, and the margin it keeps from the viewport edges. */
const OFFSET = 8;
const BUTTON_WIDTH = 108;

/**
 * The Medium-style prompt: select text inside AI-written prose and a Highlight button appears
 * above the selection. Mounted once by `AppShell`, inside the router context so it can work out
 * which page the passage came from.
 *
 * It renders into a portal on `document.body` because the prose it serves lives inside clipping
 * and scrolling containers (`SidebarInset`'s `overflow-x-hidden`, a council take's own scroll
 * box) that would crop an absolutely-positioned child.
 */
export function SelectionHighlighter() {
  const { t } = useTranslation();
  const { selection, clear } = useHighlightableSelection();
  const resolveSource = useHighlightSource();
  const { mutate: createHighlight, isPending } = useCreateHighlightMutation();

  // Side effect: Escape dismisses the prompt without saving.
  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, clear]);

  if (!selection) return null;

  const { text, rect } = selection;
  // Above the selection when there's room, below it otherwise; clamped horizontally so a
  // selection at the right edge doesn't push the button off-screen.
  const above = rect.top > 48;
  const top = above ? rect.top - OFFSET - 36 : rect.bottom + OFFSET;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - BUTTON_WIDTH / 2, OFFSET),
    window.innerWidth - BUTTON_WIDTH - OFFSET,
  );

  const save = () => {
    createHighlight(
      { text, ...resolveSource() },
      {
        onSuccess: () => {
          toast.success(t("highlights.saved"));
          clear();
        },
      },
    );
  };

  return createPortal(
    <div className="fixed z-50" style={{ top, left }}>
      <Button
        size="sm"
        disabled={isPending}
        // The button sits outside the prose, so pressing it would collapse the selection
        // before the click handler could read it. Suppressing mousedown keeps the range alive.
        onMouseDown={(event) => event.preventDefault()}
        onClick={save}
        className="shadow-md"
      >
        {isPending ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <HighlighterIcon className="size-3.5" />
        )}
        {t("highlights.button")}
      </Button>
    </div>,
    document.body,
  );
}
