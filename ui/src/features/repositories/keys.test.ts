import { describe, expect, it } from "vitest";

import { repositoryKeys } from "@/features/repositories/keys";

describe("repositoryKeys", () => {
  it("builds list keys under the shared root with params as the leaf", () => {
    expect(repositoryKeys.all).toEqual(["repositories"]);
    expect(repositoryKeys.lists()).toEqual(["repositories", "list"]);
    expect(repositoryKeys.list({ page: 2, page_size: 20 })).toEqual([
      "repositories",
      "list",
      { page: 2, page_size: 20 },
    ]);
  });

  it("prefixes every detail-scoped key with detail(id) so `all` invalidation cascades", () => {
    const detail = repositoryKeys.detail("r1");
    expect(detail).toEqual(["repositories", "detail", "r1"]);
    // Nested keys must extend detail(id) — TanStack prefix matching relies on it.
    expect(repositoryKeys.analysis("r1")).toEqual([...detail, "analysis"]);
    expect(repositoryKeys.toolLog("r1", "scc")).toEqual([
      ...detail,
      "tool-log",
      "scc",
    ]);
    expect(
      repositoryKeys.analysisDelta("r1", "s1", null).slice(0, detail.length),
    ).toEqual([...detail]);
  });
});
