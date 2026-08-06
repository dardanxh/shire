/**
 * Word-level diff, used to turn "here is a rewritten prompt" into individually
 * accept-or-reject-able changes.
 *
 * Why compute this in the client instead of asking the model for a patch list: a patch whose `old`
 * string must match the original verbatim misses the moment the model paraphrases, and the change
 * is then silently dropped. Diffing the two finished texts makes every unit applicable by
 * construction — `applyHunks(hunks, allChangedIds)` is exactly the rewritten body, and
 * `applyHunks(hunks, new Set())` is exactly the original.
 */

export type DiffOp = "equal" | "insert" | "delete" | "replace";

export interface DiffHunk {
  /** Stable within one diff result; used as the accept/reject key. */
  id: number;
  op: DiffOp;
  /** Text from the original. Empty for a pure insertion. */
  before: string;
  /** Text from the rewrite. Empty for a pure deletion. */
  after: string;
}

/**
 * Guards on the LCS matrix, which costs 4 bytes per cell.
 *
 * Real prompts get big — a 59K-character skill file is ~12K word tokens, and 12K x 12K would be
 * 576MB. So there are three tiers: word-level while it fits, then line-level (the same file is only
 * ~1200 lines, which fits comfortably), then a single whole-region replace. Line-level hunks are
 * still useful accept/reject units for a long document; an all-or-nothing block is not, so the
 * middle tier is what keeps large prompts reviewable.
 */
const MAX_WORD_CELLS = 1_000_000;
const MAX_LINE_CELLS = 4_000_000;

/** Split into words and whitespace runs, keeping both so the text can be reassembled exactly. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Split into lines, keeping the newline on each so the text can be reassembled exactly. */
function tokenizeLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

/** Longest-common-subsequence table over token arrays. */
function lcsLengths(a: string[], b: string[]): Int32Array {
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

/** Merge adjacent same-op runs, and fold a delete immediately followed by an insert into one
 * replace — a reader sees "this became that", not two unrelated edits. */
function coalesce(
  raw: Array<{ op: DiffOp; before: string; after: string }>,
): DiffHunk[] {
  const merged: Array<{ op: DiffOp; before: string; after: string }> = [];
  for (const part of raw) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...part });
      continue;
    }
    if (last.op === part.op) {
      last.before += part.before;
      last.after += part.after;
      continue;
    }
    const pairable =
      (last.op === "delete" && part.op === "insert") ||
      (last.op === "insert" && part.op === "delete") ||
      (last.op === "replace" && part.op !== "equal");
    if (pairable) {
      last.op = "replace";
      last.before += part.before;
      last.after += part.after;
      continue;
    }
    merged.push({ ...part });
  }
  return merged
    .filter((part) => part.before !== "" || part.after !== "")
    .map((part, index) => ({ id: index, ...part }));
}

/** Walk the LCS table, emitting one part per token. */
function walk(
  midA: string[],
  midB: string[],
): Array<{ op: DiffOp; before: string; after: string }> {
  const parts: Array<{ op: DiffOp; before: string; after: string }> = [];
  const width = midB.length + 1;
  const table = lcsLengths(midA, midB);
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      parts.push({ op: "equal", before: midA[i], after: midA[i] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      parts.push({ op: "delete", before: midA[i], after: "" });
      i++;
    } else {
      parts.push({ op: "insert", before: "", after: midB[j] });
      j++;
    }
  }
  for (; i < midA.length; i++) {
    parts.push({ op: "delete", before: midA[i], after: "" });
  }
  for (; j < midB.length; j++) {
    parts.push({ op: "insert", before: "", after: midB[j] });
  }
  return parts;
}

/** Shave the identical head and tail. Most rewrites keep long stretches intact, and this often
 * drops the matrix under the guard on its own. */
function trimCommon(a: string[], b: string[]) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  return {
    prefix: a.slice(0, head).join(""),
    suffix: a.slice(a.length - tail).join(""),
    midA: a.slice(head, a.length - tail),
    midB: b.slice(head, b.length - tail),
  };
}

export function diffWords(before: string, after: string): DiffHunk[] {
  if (before === after) {
    return before === "" ? [] : [{ id: 0, op: "equal", before, after }];
  }

  const words = trimCommon(tokenize(before), tokenize(after));
  const parts: Array<{ op: DiffOp; before: string; after: string }> = [];

  if ((words.midA.length + 1) * (words.midB.length + 1) <= MAX_WORD_CELLS) {
    if (words.prefix) {
      parts.push({ op: "equal", before: words.prefix, after: words.prefix });
    }
    parts.push(...walk(words.midA, words.midB));
    if (words.suffix) {
      parts.push({ op: "equal", before: words.suffix, after: words.suffix });
    }
    return coalesce(parts);
  }

  // Too big for word-level. Re-tokenize by line and try again before giving up.
  const lines = trimCommon(tokenizeLines(before), tokenizeLines(after));
  if (lines.prefix) {
    parts.push({ op: "equal", before: lines.prefix, after: lines.prefix });
  }
  if ((lines.midA.length + 1) * (lines.midB.length + 1) <= MAX_LINE_CELLS) {
    parts.push(...walk(lines.midA, lines.midB));
  } else {
    parts.push({
      op: "replace",
      before: lines.midA.join(""),
      after: lines.midB.join(""),
    });
  }
  if (lines.suffix) {
    parts.push({ op: "equal", before: lines.suffix, after: lines.suffix });
  }
  return coalesce(parts);
}

/** Hunks the user can accept or reject (everything that is not untouched text). */
export function changedHunks(hunks: DiffHunk[]): DiffHunk[] {
  return hunks.filter((hunk) => hunk.op !== "equal");
}

/**
 * Rebuild the text with `accepted` hunks taken from the rewrite and the rest left as they were.
 *
 * Whitespace-only insertions are a deliberate exception: they are structural (the blank line that
 * makes a new paragraph), never meaningful on their own, and leaving them behind when the words
 * around them were accepted produces a run-together mess. They ride along with any accepted
 * neighbour instead of needing their own checkbox.
 */
export function applyHunks(
  hunks: DiffHunk[],
  accepted: ReadonlySet<number>,
): string {
  return hunks
    .map((hunk, index) => {
      if (hunk.op === "equal") return hunk.before;
      if (accepted.has(hunk.id)) return hunk.after;
      if (hunk.op === "insert" && hunk.after.trim() === "") {
        const neighbours = [hunks[index - 1], hunks[index + 1]];
        const carried = neighbours.some(
          (side) => side && side.op !== "equal" && accepted.has(side.id),
        );
        return carried ? hunk.after : hunk.before;
      }
      return hunk.before;
    })
    .join("");
}
