import { describe, expect, it } from "vitest";

import { buildRepositoryTree } from "@/features/repositories/grouping";
import type { RepositoryOut } from "@/lib/api";

function repo(
  id: string,
  owner: string,
  name: string,
  subpath = "",
): RepositoryOut {
  return {
    id,
    provider: "github",
    owner,
    name,
    subpath,
    slug: subpath ? `${owner}/${name}/${subpath}` : `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    connection_id: null,
    default_branch: "main",
    current_branch: "main",
    status: "ready",
    watched: false,
    starred: false,
    last_analyzed_commit: null,
    last_analyzed_at: null,
    error: null,
    created_at: "2026-08-04T00:00:00Z",
    updated_at: "2026-08-04T00:00:00Z",
  };
}

describe("buildRepositoryTree", () => {
  it("nests subdirectory records under their whole-repo record", () => {
    const tree = buildRepositoryTree([
      repo("r1", "ppro", "platform"),
      repo("r2", "ppro", "platform", "packages/api"),
      repo("r3", "ppro", "platform", "packages/ui"),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("r1");
    expect(tree[0].subrepos?.map((r) => r.id)).toEqual(["r2", "r3"]);
  });

  it("keeps a family with no whole-repo record top-level", () => {
    const tree = buildRepositoryTree([
      repo("r1", "acme", "mono", "packages/api"),
      repo("r2", "acme", "mono", "packages/ui"),
    ]);

    expect(tree.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(tree.every((r) => r.subrepos === undefined)).toBe(true);
  });

  it("preserves server order across families", () => {
    const tree = buildRepositoryTree([
      repo("r1", "ppro", "platform"),
      repo("r2", "ppro", "platform", "packages/api"),
      repo("r3", "acme", "single"),
      repo("r4", "acme", "mono", "packages/ui"),
    ]);

    expect(tree.map((r) => r.id)).toEqual(["r1", "r3", "r4"]);
  });

  it("leaves a repository with no subdirectory siblings unexpandable", () => {
    const [row] = buildRepositoryTree([repo("r1", "acme", "single")]);

    expect(row.subrepos).toEqual([]);
  });

  it("adopts children even when the whole-repo record comes last", () => {
    const tree = buildRepositoryTree([
      repo("r2", "ppro", "platform", "packages/api"),
      repo("r1", "ppro", "platform"),
    ]);

    expect(tree.map((r) => r.id)).toEqual(["r1"]);
    expect(tree[0].subrepos?.map((r) => r.id)).toEqual(["r2"]);
  });

  it("does not merge same-name repos from different owners or providers", () => {
    const gitlab = {
      ...repo("r3", "ppro", "platform", "packages/api"),
      provider: "gitlab",
    };
    const tree = buildRepositoryTree([
      repo("r1", "ppro", "platform"),
      repo("r2", "acme", "platform", "packages/api"),
      gitlab,
    ]);

    expect(tree.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(tree[0].subrepos).toEqual([]);
  });
});
