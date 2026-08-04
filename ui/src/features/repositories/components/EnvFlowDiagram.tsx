import { MermaidDiagram } from "@/components/shared/MermaidDiagram";
import type { CicdEnvironmentOut, CicdTransitionOut } from "@/lib/api";

/**
 * The change-flow diagram: long-living environments as nodes, promotions as labelled arrows.
 *
 * The engine returns structured environments/transitions and this builds the Mermaid source
 * deterministically — a model that hand-writes diagram syntax eventually writes broken diagram
 * syntax, and this way the palette and node shape stay identical across repositories.
 */

/** Per-environment-kind colours; our own `classDef` wins over the shared renderer's palette. */
const KIND_CLASS_DEFS = [
  "classDef prod fill:#fef2f2,stroke:#ef4444,color:#7f1d1d",
  "classDef staging fill:#fffbeb,stroke:#f59e0b,color:#78350f",
  "classDef qa fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a",
  "classDef dev fill:#ecfdf5,stroke:#10b981,color:#064e3b",
  "classDef preview fill:#f5f3ff,stroke:#8b5cf6,color:#4c1d95",
  "classDef other fill:#f8fafc,stroke:#94a3b8,color:#334155",
];

const KINDS = ["prod", "staging", "qa", "dev", "preview", "other"];

/** Mermaid node ids must be plain identifiers, and labels must not contain its delimiters. */
function nodeId(key: string, index: number): string {
  const safe = key.replace(/[^a-zA-Z0-9]/g, "_");
  return /^[a-zA-Z]/.test(safe) ? safe : `env_${index}_${safe}`;
}

function escapeLabel(text: string): string {
  return text
    .replace(/["<>|{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildEnvFlowMermaid(
  environments: CicdEnvironmentOut[],
  transitions: CicdTransitionOut[],
): string {
  if (environments.length === 0) return "";
  const ids = new Map<string, string>();
  environments.forEach((env, i) => {
    ids.set(env.key, nodeId(env.key, i));
  });

  // Lower environments feed higher ones, so lay the flow out left-to-right in that direction.
  const lines = ["flowchart LR"];
  for (const env of environments) {
    const id = ids.get(env.key) as string;
    const head = escapeLabel(env.name || env.key);
    const branch = env.branch ? `<br/><i>${escapeLabel(env.branch)}</i>` : "";
    const steps = transitions
      .filter((t) => t.to_env === env.key)
      .flatMap((t) => t.steps)
      .slice(0, 8);
    const bullets = steps.length
      ? `<br/>${steps.map((s) => `· ${escapeLabel(s)}`).join("<br/>")}`
      : "";
    const kind = KINDS.includes(env.kind) ? env.kind : "other";
    lines.push(`  ${id}["${head}${branch}${bullets}"]:::${kind}`);
  }
  for (const transition of transitions) {
    const from = ids.get(transition.from_env);
    const to = ids.get(transition.to_env);
    if (!from || !to) continue;
    const label = escapeLabel(transition.trigger);
    lines.push(label ? `  ${from} -->|${label}| ${to}` : `  ${from} --> ${to}`);
  }
  lines.push(...KIND_CLASS_DEFS.map((def) => `  ${def}`));
  return lines.join("\n");
}

export function EnvFlowDiagram({
  environments,
  transitions,
}: {
  environments: CicdEnvironmentOut[];
  transitions: CicdTransitionOut[];
}) {
  const source = buildEnvFlowMermaid(environments, transitions);
  if (!source) return null;
  return <MermaidDiagram source={source} />;
}
