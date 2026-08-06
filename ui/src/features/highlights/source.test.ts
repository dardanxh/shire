import { describe, expect, it } from "vitest";

import { highlightTarget } from "@/features/highlights/source";
import type { HighlightOut } from "@/lib/api";

function highlight(overrides: Partial<HighlightOut>): HighlightOut {
  return {
    id: "h1",
    text: "a kept sentence",
    source_kind: "merge_review",
    source_id: "22222222-2222-2222-2222-222222222222",
    source_label: "repos/data-dbt · MR",
    repository_id: null,
    created_at: "2026-08-06T09:00:00Z",
    ...overrides,
  };
}

describe("highlightTarget", () => {
  it("sends a repository highlight back to the tab it came from", () => {
    expect(
      highlightTarget(
        highlight({ source_kind: "repository.ask", source_id: "repo-1" }),
      ),
    ).toEqual({
      to: "/repositories/$id",
      params: { id: "repo-1" },
      search: { tab: "ask" },
    });
  });

  it("keeps hyphenated tabs intact", () => {
    expect(
      highlightTarget(
        highlight({
          source_kind: "repository.tech-stack",
          source_id: "repo-1",
        }),
      ),
    ).toMatchObject({ search: { tab: "tech-stack" } });
  });

  it("routes entity-backed kinds by id", () => {
    expect(highlightTarget(highlight({ source_kind: "merge_review" }))).toEqual(
      {
        to: "/merge-reviews/$id",
        params: { id: "22222222-2222-2222-2222-222222222222" },
      },
    );
    expect(
      highlightTarget(highlight({ source_kind: "council" })),
    ).toMatchObject({ to: "/council/$id" });
    expect(
      highlightTarget(highlight({ source_kind: "roadmap" })),
    ).toMatchObject({ to: "/roadmaps/$id" });
  });

  it("routes Developments without an entity id", () => {
    expect(
      highlightTarget(
        highlight({ source_kind: "developments.pulse", source_id: null }),
      ),
    ).toEqual({ to: "/developments", search: { tab: "pulse" } });
  });

  it("has no link for an unmapped page or a kind missing its id", () => {
    expect(
      highlightTarget(highlight({ source_kind: "page", source_id: null })),
    ).toBeNull();
    // A council highlight whose id somehow went missing must not build a broken link.
    expect(
      highlightTarget(highlight({ source_kind: "council", source_id: null })),
    ).toBeNull();
  });
});
