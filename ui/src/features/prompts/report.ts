import type { TFunction } from "i18next";

import type {
  PromptAnalysisOut,
  PromptDetailOut,
  PromptFinding,
  PromptReviewOut,
  PromptSuggestionOut,
} from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { scoreVariant } from "./components/ScoreBadge";
import { REVIEW_DIMENSIONS, scoreFor } from "./reviews";

type PromptVersionDetail = NonNullable<PromptDetailOut["current_version"]>;

const SEVERITY_ORDER = ["blocker", "warn", "info"] as const;

/** Escapes text for HTML. Everything that reaches the report is user or model text, so every value goes through here. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A filesystem-safe file name for the report, e.g. `big-query-skill-v1-report.html`. */
export function reportFileName(name: string, versionNumber: number): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "prompt";
  return `${slug}-v${versionNumber}-report.html`;
}

const STYLES = `
  :root { color-scheme: light; --fg:#18181b; --muted:#71717a; --border:#e4e4e7; --card:#fafafa;
    --success:#15803d; --success-bg:#dcfce7; --warning:#c2410c; --warning-bg:#ffedd5;
    --danger:#b91c1c; --danger-bg:#fee2e2; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: #fff; }
  main { max-width: 960px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  h3 { font-size: 13px; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  p { margin: 0 0 8px; }
  .muted { color: var(--muted); }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; border: 1px solid var(--border); background: #fff; }
  .badge.success { color: var(--success); background: var(--success-bg); border-color: transparent; }
  .badge.warning { color: var(--warning); background: var(--warning-bg); border-color: transparent; }
  .badge.destructive { color: var(--danger); background: var(--danger-bg); border-color: transparent; }
  section.card { border: 1px solid var(--border); border-radius: 12px; background: var(--card); padding: 20px; margin-top: 20px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .stat span { display: block; }
  .stat .label { font-size: 12px; color: var(--muted); }
  .stat .value { font-weight: 600; }
  .prompt { max-height: 560px; overflow: auto; margin: 0; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: #fff;
    font: 12.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
  .bars { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px 24px; }
  .bar-label { display: flex; justify-content: space-between; font-size: 13px; }
  .track { height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; margin-top: 4px; }
  .fill { height: 100%; border-radius: 999px; }
  .fill.success { background: var(--success); } .fill.warning { background: var(--warning); } .fill.destructive { background: var(--danger); }
  ul.items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  ul.items li { border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 12px 14px; }
  .item-title { font-weight: 600; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; background: #f4f4f5; padding: 1px 6px; border-radius: 4px; display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
  .prose { white-space: pre-wrap; }
  footer { margin-top: 32px; font-size: 12px; color: var(--muted); }
`;

function badge(text: string, variant = ""): string {
  return `<span class="badge ${variant}">${escapeHtml(text)}</span>`;
}

function scoreBadge(score: number | null | undefined): string {
  return score === null || score === undefined
    ? badge("—")
    : badge(String(score), scoreVariant(score));
}

function stat(label: string, value: string): string {
  return `<div class="stat"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

function findingsSection(t: TFunction, findings: PromptFinding[]): string {
  if (findings.length === 0) {
    return `<p><strong>${escapeHtml(t("prompts.checks.clean_title"))}</strong></p>
      <p class="muted">${escapeHtml(t("prompts.checks.clean_body"))}</p>`;
  }
  return SEVERITY_ORDER.map((severity) => {
    const items = findings.filter((finding) => finding.severity === severity);
    if (items.length === 0) return "";
    const list = items
      .map(
        (finding) => `<li>
          <div class="item-title">${escapeHtml(finding.title)}
            ${badge(t(`prompts.checks.dimension.${finding.dimension}`, { defaultValue: finding.dimension }))}
            ${finding.occurrences > 1 ? badge(t("prompts.checks.occurrences", { count: finding.occurrences })) : ""}
          </div>
          <p>${escapeHtml(finding.detail)}</p>
          ${finding.evidence ? `<p><code>${escapeHtml(finding.evidence)}</code></p>` : ""}
          <p class="muted">${escapeHtml(finding.why_it_matters)}</p>
        </li>`,
      )
      .join("");
    return `<h3>${escapeHtml(t(`prompts.checks.severity.${severity}`))} (${items.length})</h3><ul class="items">${list}</ul>`;
  }).join("");
}

function reviewSection(
  t: TFunction,
  review: PromptReviewOut | undefined,
): string {
  if (review?.status !== "done") {
    return `<p class="muted">${escapeHtml(t("prompts.review.empty"))}</p>`;
  }
  const bars = REVIEW_DIMENSIONS.map(({ key, inverted }) => {
    const value = scoreFor(review, key);
    const label = escapeHtml(t(`prompts.review.dimension.${key}`));
    if (value === null) {
      return `<div><div class="bar-label"><span>${label}</span><span class="muted">${escapeHtml(t("prompts.review.not_scored"))}</span></div><div class="track"></div></div>`;
    }
    const variant = scoreVariant(inverted ? 100 - value : value);
    return `<div><div class="bar-label"><span>${label}</span><span>${value}</span></div>
      <div class="track"><div class="fill ${variant}" style="width:${Math.max(0, Math.min(100, value))}%"></div></div></div>`;
  }).join("");

  const findings = review.findings
    .map(
      (finding) => `<li>
        <div class="item-title">${escapeHtml(finding.title)}
          ${badge(
            t(`prompts.review.severity.${finding.severity}`, {
              defaultValue: finding.severity,
            }),
            finding.severity === "high"
              ? "destructive"
              : finding.severity === "medium"
                ? "warning"
                : "",
          )}
          ${badge(t(`prompts.review.dimension.${finding.dimension}`, { defaultValue: finding.dimension }))}
        </div>
        <p class="muted">${escapeHtml(finding.detail)}</p>
        ${finding.evidence ? `<p><code>${escapeHtml(finding.evidence)}</code></p>` : ""}
      </li>`,
    )
    .join("");

  return `<p class="muted">${escapeHtml(review.model)}${review.finished_at ? ` · ${escapeHtml(formatDateTime(review.finished_at))}` : ""}</p>
    <p class="muted">${escapeHtml(t("prompts.review.caveat"))}</p>
    <div class="bars">${bars}</div>
    ${review.summary ? `<h3>${escapeHtml(t("prompts.report.summary"))}</h3><p class="prose">${escapeHtml(review.summary)}</p>` : ""}
    ${findings ? `<h3>${escapeHtml(t("prompts.report.review_findings"))}</h3><ul class="items">${findings}</ul>` : ""}`;
}

function suggestionSection(
  t: TFunction,
  suggestion: PromptSuggestionOut | undefined,
): string {
  if (suggestion?.status !== "done" || suggestion.changes.length === 0)
    return "";
  const changes = suggestion.changes
    .map(
      (change) => `<li>
        <div class="item-title">${escapeHtml(change.title)}
          ${badge(t(`prompts.review.dimension.${change.dimension}`, { defaultValue: change.dimension }))}
        </div>
        <p class="muted">${escapeHtml(change.rationale)}</p>
      </li>`,
    )
    .join("");
  return `<section class="card">
    <h2>${escapeHtml(t("prompts.report.proposed_changes"))}</h2>
    <p class="muted">${escapeHtml(suggestion.model)}</p>
    ${suggestion.summary ? `<p class="prose">${escapeHtml(suggestion.summary)}</p>` : ""}
    <ul class="items">${changes}</ul>
  </section>`;
}

/**
 * A standalone, shareable HTML report for one saved prompt version: the full prompt, the
 * deterministic checks, the latest model review and the latest proposed changes.
 *
 * Self-contained (inline CSS, no scripts, no network) so it opens anywhere it is sent. `analysis`
 * is only for the extra word/goal stats and must describe `version.body` — pass it only when the
 * editor is not dirty.
 */
export function buildPromptReportHtml({
  t,
  prompt,
  version,
  analysis,
  generatedAt = new Date(),
}: {
  t: TFunction;
  prompt: PromptDetailOut;
  version: PromptVersionDetail;
  analysis?: PromptAnalysisOut;
  generatedAt?: Date;
}): string {
  const { tuning } = version;
  const title = `${prompt.name} — ${t("prompts.versions.number", { number: version.number })}`;

  const stats = [
    stat(
      t("prompts.checks.tokens"),
      formatNumber(version.estimated_input_tokens),
    ),
    stat(
      t("prompts.checks.size"),
      t(`prompts.checks.size_verdict.${version.size_verdict}`, {
        defaultValue: version.size_verdict,
      }),
    ),
    ...(analysis
      ? [
          stat(t("prompts.checks.goals"), formatNumber(analysis.goal_count)),
          stat(t("prompts.checks.words"), formatNumber(analysis.stats.words)),
        ]
      : []),
    stat(
      t("prompts.tuning.archetype"),
      t(`prompts.tuning.archetype_option.${tuning.archetype}`),
    ),
    stat(t("prompts.tuning.criticality"), `${tuning.criticality}/5`),
    stat(t("prompts.tuning.sensitivity"), `${tuning.sensitivity}/5`),
    stat(t("prompts.tuning.verbosity"), `${tuning.verbosity}/5`),
    stat(
      t("prompts.tuning.output_format"),
      t(`prompts.tuning.output_format_option.${tuning.output_format}`),
    ),
    ...(tuning.audience
      ? [stat(t("prompts.tuning.audience"), tuning.audience)]
      : []),
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <header>
    <h1>${escapeHtml(prompt.name)}</h1>
    ${prompt.description ? `<p class="muted">${escapeHtml(prompt.description)}</p>` : ""}
    <div class="meta">
      ${badge(t("prompts.versions.number", { number: version.number }))}
      <span class="badge ${scoreVariant(version.static_score)}">${escapeHtml(t("prompts.checks.score"))} ${version.static_score}</span>
      ${prompt.tags.map((tag) => badge(tag)).join("")}
    </div>
  </header>

  <section class="card">
    <h2>${escapeHtml(t("prompts.report.overview"))}</h2>
    <div class="stats">${stats}</div>
    ${version.guidance ? `<h3>${escapeHtml(t("prompts.report.guidance"))}</h3><p class="prose">${escapeHtml(version.guidance)}</p>` : ""}
  </section>

  <section class="card">
    <h2>${escapeHtml(t("prompts.report.prompt"))}</h2>
    <pre class="prompt">${escapeHtml(version.body)}</pre>
  </section>

  <section class="card">
    <h2>${escapeHtml(t("prompts.report.checks"))} ${scoreBadge(version.static_score)}</h2>
    <p class="muted">${escapeHtml(t("prompts.checks.scoring_note"))}</p>
    ${findingsSection(t, version.findings)}
  </section>

  <section class="card">
    <h2>${escapeHtml(t("prompts.review.title"))}</h2>
    ${reviewSection(t, version.reviews[0])}
  </section>

  ${suggestionSection(t, version.suggestions[0])}

  <footer>${escapeHtml(t("prompts.report.generated", { date: formatDateTime(generatedAt.toISOString()) }))}</footer>
</main>
</body>
</html>
`;
}

/** Hands the report to the browser as a file download. */
export function downloadHtml(html: string, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
