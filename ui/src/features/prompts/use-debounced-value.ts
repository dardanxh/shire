import { useEffect, useState } from "react";

/**
 * A copy of `value` that only catches up after `delayMs` of quiet.
 *
 * Feature-local on purpose: the one consumer is the prompt editor, which scores the body on every
 * pause without firing a request per keystroke. Promote it to `hooks/` if a second caller appears.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  // Owns a timer: the only side effect here is scheduling (and cancelling) the catch-up.
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
