import type { Bookmark } from "./api";

/**
 * In-memory bookmark search. Every whitespace-separated term must match
 * somewhere (name, host, URL, category, description). Better field matches rank
 * higher; ties keep the server's order (starred, then most used), so frequently
 * used bookmarks win among equally good matches.
 */
export function rankBookmarks(rows: Bookmark[], query: string): Bookmark[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;

  const scored: { bookmark: Bookmark; score: number; index: number }[] = [];
  rows.forEach((bookmark, index) => {
    const name = bookmark.name.toLowerCase();
    const host = bookmark.host.toLowerCase();
    const url = bookmark.url.toLowerCase();
    const category = (bookmark.category_name ?? "").toLowerCase();
    const description = (bookmark.description ?? "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name.startsWith(term)) score += 100;
      else if (name.split(/[\s\-_/.]+/).some((w) => w.startsWith(term)))
        score += 60;
      else if (name.includes(term)) score += 40;
      else if (host.includes(term) || category.includes(term)) score += 25;
      else if (url.includes(term)) score += 15;
      else if (description.includes(term)) score += 5;
      else return; // a term matched nothing: not a result
    }
    scored.push({ bookmark, score, index });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.bookmark);
}
