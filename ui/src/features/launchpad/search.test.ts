import { describe, expect, it } from "vitest";

import type { Bookmark } from "./api";
import { rankBookmarks } from "./search";

function bookmark(name: string, extra: Partial<Bookmark> = {}): Bookmark {
  return {
    id: name,
    name,
    url: `https://${name.toLowerCase().replaceAll(" ", "-")}.example.com`,
    host: `${name.toLowerCase().replaceAll(" ", "-")}.example.com`,
    description: null,
    category_id: null,
    category_name: null,
    starred: false,
    logo_kind: "monogram",
    logo_color: null,
    logo_url: null,
    visit_count: 0,
    last_visited_at: null,
    score: 0,
    action: null,
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
    ...extra,
  };
}

describe("rankBookmarks", () => {
  // Server order: starred / most-used first.
  const rows = [
    bookmark("Datadog"),
    bookmark("Ops Jira board", { description: "bigquery access tickets" }),
    bookmark("Jira DATA project"),
    bookmark("Google group: data-eng", { category_name: "Google Groups" }),
  ];

  it("returns the server order for an empty query", () => {
    expect(rankBookmarks(rows, "  ")).toBe(rows);
  });

  it("ranks name prefixes above word matches, keeping server order on ties", () => {
    expect(rankBookmarks(rows, "jira").map((b) => b.name)).toEqual([
      "Jira DATA project",
      "Ops Jira board",
    ]);
  });

  it("requires every term to match somewhere", () => {
    expect(rankBookmarks(rows, "jira bigquery").map((b) => b.name)).toEqual([
      "Ops Jira board",
    ]);
    expect(rankBookmarks(rows, "jira nothing")).toEqual([]);
  });

  it("matches categories", () => {
    expect(rankBookmarks(rows, "groups").map((b) => b.name)).toEqual([
      "Google group: data-eng",
    ]);
  });
});
