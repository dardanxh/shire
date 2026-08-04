/**
 * Nesting for the repositories table. A monorepo is onboarded once per subdirectory, and
 * each of those is a plain repository record — there is no parent FK. Records sharing
 * provider/owner/name are one family, and the one with an empty `subpath` is the
 * whole-repo record the others hang off.
 */
import type { RepositoryOut } from "@/lib/api";

/** A table row: a repository plus the subdirectory records nested under it. */
export type RepositoryTreeRow = RepositoryOut & { subrepos?: RepositoryOut[] };

const familyKey = (repo: RepositoryOut) =>
  `${repo.provider}/${repo.owner}/${repo.name}`;

/**
 * Nest subdirectory records under their whole-repo record, preserving server order.
 * A family with no whole-repo record (only subdirectories were ever onboarded) keeps its
 * rows top-level — there is no real repository to hide them behind, and inventing a
 * header row would give the user something they can't open, refresh or delete.
 */
export function buildRepositoryTree(
  rows: RepositoryOut[],
): RepositoryTreeRow[] {
  const parents = new Map<string, RepositoryTreeRow>();
  for (const repo of rows) {
    if (!repo.subpath) parents.set(familyKey(repo), { ...repo, subrepos: [] });
  }

  const tree: RepositoryTreeRow[] = [];
  for (const repo of rows) {
    const parent = parents.get(familyKey(repo));
    if (!repo.subpath) {
      // The clone in `parents` is what carries the children.
      if (parent) tree.push(parent);
      continue;
    }
    if (parent?.subrepos) parent.subrepos.push(repo);
    else tree.push(repo);
  }
  return tree;
}
