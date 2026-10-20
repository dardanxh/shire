import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import {
  buildPromptReportHtml,
  escapeHtml,
  reportFileName,
} from "@/features/prompts/report";
import type { PromptDetailOut } from "@/lib/api";

/** Echoes the key, so assertions do not depend on the English copy. */
const t = ((key: string) => key) as unknown as TFunction;

type Version = NonNullable<PromptDetailOut["current_version"]>;

const version = {
  id: "v1",
  prompt_id: "p1",
  number: 2,
  body: "Use <b>bold</b> & keep it short",
  guidance: "Tighten it",
  tuning: {
    criticality: 3,
    sensitivity: 1,
    verbosity: 3,
    archetype: "clear_crisp",
    output_format: "none",
    disclaimer: false,
    target_model: "sonnet",
  },
  source: "manual",
  note: null,
  estimated_input_tokens: 12,
  static_score: 73,
  size_verdict: "right",
  created_at: "2026-10-20T10:00:00Z",
  findings: [
    {
      rule_id: "r1",
      dimension: "structure",
      severity: "warn",
      title: "No output shape",
      detail: "Say what the answer looks like.",
      why_it_matters: "Models guess otherwise.",
      occurrences: 1,
      evidence: null,
    },
  ],
  suggestions: [],
  reviews: [],
  batches: [],
} as Version;

const prompt = {
  id: "p1",
  name: "Big <Query> skill",
  description: null,
  tags: ["data"],
  current_version: version,
} as unknown as PromptDetailOut;

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("reportFileName", () => {
  it("slugifies the prompt name", () => {
    expect(reportFileName("big query skill", 1)).toBe(
      "big-query-skill-v1-report.html",
    );
  });

  it("falls back when nothing survives the slug", () => {
    expect(reportFileName("!!!", 3)).toBe("prompt-v3-report.html");
  });
});

describe("buildPromptReportHtml", () => {
  const html = buildPromptReportHtml({ t, prompt, version });

  it("includes the full prompt body, escaped", () => {
    expect(html).toContain("Use &lt;b&gt;bold&lt;/b&gt; &amp; keep it short");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("Big &lt;Query&gt; skill");
  });

  it("lists the deterministic findings", () => {
    expect(html).toContain("No output shape");
    expect(html).toContain("Models guess otherwise.");
  });

  it("says when there is no model review yet", () => {
    expect(html).toContain("prompts.review.empty");
  });
});
