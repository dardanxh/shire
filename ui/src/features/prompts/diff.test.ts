import { describe, expect, it } from "vitest";

import {
  applyHunks,
  changedHunks,
  type DiffHunk,
  diffWords,
} from "@/features/prompts/diff";

const ids = (hunks: DiffHunk[]) => new Set(hunks.map((hunk) => hunk.id));

describe("diffWords", () => {
  it("returns nothing for two empty texts", () => {
    expect(diffWords("", "")).toEqual([]);
  });

  it("returns a single equal hunk for identical text", () => {
    const hunks = diffWords("same words here", "same words here");

    expect(hunks).toHaveLength(1);
    expect(hunks[0].op).toBe("equal");
    expect(changedHunks(hunks)).toEqual([]);
  });

  it("finds a replaced word and leaves the rest equal", () => {
    const hunks = diffWords("the quick brown fox", "the slow brown fox");
    const changed = changedHunks(hunks);

    expect(changed).toHaveLength(1);
    expect(changed[0].op).toBe("replace");
    expect(changed[0].before.trim()).toBe("quick");
    expect(changed[0].after.trim()).toBe("slow");
  });

  it("reports a pure insertion and a pure deletion", () => {
    const inserted = changedHunks(diffWords("a c", "a b c"));
    expect(inserted.map((hunk) => hunk.op)).toEqual(["insert"]);
    expect(inserted[0].before).toBe("");

    const deleted = changedHunks(diffWords("a b c", "a c"));
    expect(deleted.map((hunk) => hunk.op)).toEqual(["delete"]);
    expect(deleted[0].after).toBe("");
  });

  it("gives every hunk a distinct id", () => {
    const hunks = diffWords(
      "one two three four five six",
      "one TWO three FOUR five SIX",
    );

    expect(ids(hunks).size).toBe(hunks.length);
  });
});

describe("applyHunks", () => {
  const before =
    "You are a helpful assistant. CRITICAL: comply. Summarise the thread.";
  const after =
    "Summarise the support thread for the engineer picking it up next.";

  it("reconstructs the original when nothing is accepted", () => {
    const hunks = diffWords(before, after);

    expect(applyHunks(hunks, new Set())).toBe(before);
  });

  it("reconstructs the rewrite when everything is accepted", () => {
    const hunks = diffWords(before, after);

    expect(applyHunks(hunks, ids(changedHunks(hunks)))).toBe(after);
  });

  it("round-trips multi-paragraph text with blank lines intact", () => {
    const original = "First para.\n\nSecond para.\n\nThird para.\n";
    const rewritten = "First para, revised.\n\nSecond para.\n\nA new third.\n";
    const hunks = diffWords(original, rewritten);

    expect(applyHunks(hunks, new Set())).toBe(original);
    expect(applyHunks(hunks, ids(changedHunks(hunks)))).toBe(rewritten);
  });

  it("applies only the accepted hunks", () => {
    const hunks = diffWords("alpha beta gamma", "ALPHA beta GAMMA");
    const changed = changedHunks(hunks);
    expect(changed).toHaveLength(2);

    const firstOnly = applyHunks(hunks, new Set([changed[0].id]));
    expect(firstOnly).toContain("ALPHA");
    expect(firstOnly).toContain("gamma");
    expect(firstOnly).not.toContain("GAMMA");
  });

  it("carries a whitespace-only insertion along with an accepted neighbour", () => {
    // The blank line that creates a paragraph is structural: accepting the words around it while
    // leaving it behind would run the sentences together.
    const hunks = diffWords(
      "one sentence. another one.",
      "one sentence.\n\nA rewritten one.",
    );
    const merged = applyHunks(hunks, ids(changedHunks(hunks)));

    expect(merged).toBe("one sentence.\n\nA rewritten one.");
  });

  it("keeps a large rewrite usable by offering it as one unit", () => {
    // Past the DP guard the diff degrades rather than hanging the tab; the accept/reject contract
    // must still hold exactly.
    const big = Array.from({ length: 1400 }, (_, i) => `word${i}`).join(" ");
    const other = Array.from({ length: 1400 }, (_, i) => `token${i}`).join(" ");
    const hunks = diffWords(big, other);

    expect(applyHunks(hunks, new Set())).toBe(big);
    expect(applyHunks(hunks, ids(changedHunks(hunks)))).toBe(other);
  });

  it("falls back to line-level rather than one block on a document-sized rewrite", () => {
    // A real 59K-character prompt is ~12K word tokens — far past the word guard, but only ~1200
    // lines. Degrading to line hunks keeps it reviewable; a single all-or-nothing block would not.
    const line = (i: number) =>
      `Line ${i}: ${"the quick brown fox jumps over the lazy dog. ".repeat(3)}`;
    const original = Array.from({ length: 1200 }, (_, i) => line(i)).join("\n");
    // Change every tenth line, so a line-level diff finds many separate hunks.
    const rewritten = Array.from({ length: 1200 }, (_, i) =>
      i % 10 === 0 ? `Line ${i}: rewritten.` : line(i),
    ).join("\n");

    const hunks = diffWords(original, rewritten);
    const changed = changedHunks(hunks);

    expect(changed.length).toBeGreaterThan(50);
    expect(applyHunks(hunks, new Set())).toBe(original);
    expect(applyHunks(hunks, ids(changed))).toBe(rewritten);
  });
});
