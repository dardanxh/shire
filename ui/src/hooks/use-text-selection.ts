import { useCallback, useEffect, useState } from "react";

/** The minimum selection worth offering a highlight for — below this it's a stray double-click. */
const MIN_LENGTH = 3;

export interface HighlightableSelection {
  /** The selected text, as the user sees it. */
  text: string;
  /** Viewport rect of the selection, for positioning a fixed-position toolbar. */
  rect: DOMRect;
}

/**
 * Reads the current selection when — and only when — it sits inside an element marked
 * `data-highlightable` (see `Markdown` and `Highlightable`). Returns null the rest of the time,
 * so a consumer can render its toolbar unconditionally.
 */
export function readHighlightableSelection(): HighlightableSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return null;

  const text = selection.toString().trim();
  if (text.length < MIN_LENGTH) return null;

  const range = selection.getRangeAt(0);
  // A text node has no `closest`; climb to its element parent first. Both ends must be inside
  // the same highlightable block, so a drag that runs off into the page chrome doesn't count.
  const start = elementOf(range.startContainer)?.closest(
    "[data-highlightable]",
  );
  const end = elementOf(range.endContainer)?.closest("[data-highlightable]");
  if (!start || start !== end) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, rect };
}

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

/**
 * Live highlightable selection, or null. Follows `selectionchange` to appear and disappear with
 * the selection, and drops on scroll/resize rather than re-measuring — the anchor rect would go
 * stale mid-scroll and a toolbar sliding along the text reads as a bug.
 */
export function useHighlightableSelection(): {
  selection: HighlightableSelection | null;
  clear: () => void;
} {
  const [selection, setSelection] = useState<HighlightableSelection | null>(
    null,
  );

  // Side effect: subscribes to the document's selection and the events that invalidate its rect.
  useEffect(() => {
    const onSelectionChange = () => setSelection(readHighlightableSelection());
    const dismiss = () => setSelection(null);
    document.addEventListener("selectionchange", onSelectionChange);
    // Capture phase: scrolling happens in inner containers too (a council take's own
    // scroll box), and those events don't bubble to the window.
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);

  const clear = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection, clear };
}
