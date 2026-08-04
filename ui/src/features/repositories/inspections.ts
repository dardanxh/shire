/** Presentation helpers for the inspection checklist and the list table's Checks column. */

const TOOL_PREFIX = "tool:";

/**
 * Human label for an inspection key.
 *
 * Integrations are named after the binary they run (`gitleaks`, `scc`, `syft`) — product
 * names, not copy, so they render verbatim. Everything else goes through i18n; the `:` in
 * `architecture:component` becomes `_` because i18next reads a colon as a namespace
 * separator and would silently look up the wrong key.
 */
export function inspectionLabel(
  key: string,
  t: (key: string) => string,
): string {
  if (key.startsWith(TOOL_PREFIX)) return key.slice(TOOL_PREFIX.length);
  return t(`repositories.view.actions.items.${key.replace(":", "_")}`);
}

/** Semantic text token for a completion ratio. Green near done, amber mid, red when barely
 * started — the digits are always rendered alongside, so colour is never the only channel. */
export function completionToneClass(completed: number, total: number): string {
  if (total === 0) return "text-muted-foreground";
  const ratio = completed / total;
  if (ratio >= 0.8) return "text-success";
  if (ratio >= 0.4) return "text-warning";
  return "text-destructive";
}
