import type { TechCategoryTree } from "./api";

export interface FlatCategory {
  id: string;
  slug: string;
  name: string;
  /** "Group / Category" for nested nodes, plain name for top-level leaves. */
  label: string;
}

/** Leaf categories (nodes without children) — what technologies attach to. */
export function flattenCategories(
  tree: TechCategoryTree[] | undefined,
): FlatCategory[] {
  const flat: FlatCategory[] = [];
  for (const node of tree ?? []) {
    const children = node.children ?? [];
    if (children.length === 0) {
      flat.push({
        id: node.id,
        slug: node.slug,
        name: node.name,
        label: node.name,
      });
      continue;
    }
    for (const child of children) {
      flat.push({
        id: child.id,
        slug: child.slug,
        name: child.name,
        label: `${node.name} / ${child.name}`,
      });
    }
  }
  return flat;
}

/** id → name lookup across the whole tree (groups and categories). */
export function categoryNamesById(
  tree: TechCategoryTree[] | undefined,
): Map<string, string> {
  const names = new Map<string, string>();
  const walk = (nodes: TechCategoryTree[] | undefined) => {
    for (const node of nodes ?? []) {
      names.set(node.id, node.name);
      walk(node.children);
    }
  };
  walk(tree);
  return names;
}

/** category id (group or leaf) → its top-level group slug — for stable per-group tinting. */
export function groupSlugsByCategoryId(
  tree: TechCategoryTree[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of tree ?? []) {
    map.set(group.id, group.slug);
    for (const child of group.children ?? []) {
      map.set(child.id, group.slug);
    }
  }
  return map;
}
