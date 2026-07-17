import { useEffect, useSyncExternalStore } from "react";

/**
 * Detail pages replace their static breadcrumb leaf (an i18n key like "Hobit") with the
 * loaded entity's name. Queries live in the page, not in route loaders, so the label is
 * published through this tiny external store and consumed by <Breadcrumbs />.
 */
let override: string | null = null;
const listeners = new Set<() => void>();

function publish(label: string | null) {
  override = label;
  for (const notify of listeners) notify();
}

/** Page-side: show `label` as the last breadcrumb while mounted (no-op until it loads). */
export function useCrumbOverride(label: string | undefined) {
  // Side effect this owns: publishing/withdrawing the label in the breadcrumb store.
  useEffect(() => {
    if (label) publish(label);
    return () => publish(null);
  }, [label]);
}

/** Breadcrumbs-side: the current override label, if any. */
export function useCrumbOverrideValue(): string | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => override,
  );
}
