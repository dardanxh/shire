import { useEffect, useId, useState } from "react";

/**
 * Mermaid is ~1 MB minified, so it's lazy-loaded on first diagram render and
 * initialized exactly once per app (module-level promise as the guard).
 */
let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      // Soft, cohesive palette + rounded nodes, drop shadows, curved links.
      fontFamily:
        "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif",
      // Uniform default: every untagged node looks the same (white, indigo
      // border) across ALL diagrams; role colours come from the classDefs below.
      themeVariables: {
        fontSize: "14px",
        primaryColor: "#ffffff",
        primaryBorderColor: "#6366f1",
        primaryTextColor: "#1e293b",
        lineColor: "#94a3b8",
        secondaryColor: "#f8fafc",
        tertiaryColor: "#f8fafc",
        clusterBkg: "#f8fafc",
        clusterBorder: "#cbd5e1",
        titleColor: "#334155",
        edgeLabelBackground: "#ffffff",
      },
      flowchart: {
        curve: "basis",
        padding: 16,
        nodeSpacing: 45,
        rankSpacing: 65,
        useMaxWidth: true,
      },
      themeCSS: `
        .node rect, .node polygon, .node circle, .node ellipse, .node path {
          rx: 10; ry: 10;
          filter: drop-shadow(0 1px 2px rgb(15 23 42 / 0.10));
        }
        .cluster rect { rx: 14; ry: 14; }
        .nodeLabel { font-weight: 500; }
        .edgeLabel { font-size: 11px; }
        .flowchart-link { stroke-width: 1.5px; }
      `,
    });
    return mermaid;
  });
  return mermaidPromise;
}

/**
 * The role palette — identical in EVERY architecture diagram, so the same role
 * always reads as the same colour: sources blue, processing violet, storage
 * green, serving amber, governance grey (dashed). Diagrams opt in by tagging
 * nodes `:::source` etc.; a diagram's own `classDef` for a name wins over ours.
 */
const ROLE_CLASS_DEFS: Record<string, string> = {
  source: "classDef source fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a",
  process: "classDef process fill:#f5f3ff,stroke:#8b5cf6,color:#4c1d95",
  store: "classDef store fill:#ecfdf5,stroke:#10b981,color:#064e3b",
  serve: "classDef serve fill:#fffbeb,stroke:#f59e0b,color:#78350f",
  govern:
    "classDef govern fill:#f8fafc,stroke:#94a3b8,color:#334155,stroke-dasharray:4 3",
};

/** Lucide path markup (24x24 stroke icons) stamped onto nodes per role. */
const ROLE_ICON_MARKUP: Record<string, string> = {
  // database
  source:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  // hammer
  process:
    '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>',
  // hard-drive
  store:
    '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  // bar-chart
  serve:
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  // shield
  govern:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};

// Matches each role's border color from ROLE_CLASS_DEFS below.
const ROLE_ICON_COLOR: Record<string, string> = {
  source: "#3b82f6",
  process: "#8b5cf6",
  store: "#10b981",
  serve: "#f59e0b",
  govern: "#94a3b8",
};

/**
 * Stamp a small role icon (database, hammer, drive, chart, shield) into the
 * top-left corner of every role-tagged node. Works on the serialized SVG so
 * on-screen rendering and file exports get identical icons.
 */
function decorateRoleIcons(svg: string): string {
  try {
    // HTML parsing (not XML): mermaid's HTML labels emit tags like <br> that
    // are not well-formed XML — DOMParser("image/svg+xml") would yield a
    // parsererror document that then renders as an error box.
    const holder = document.createElement("div");
    holder.innerHTML = svg;
    const SVG_NS = "http://www.w3.org/2000/svg";
    holder.querySelectorAll("g.node").forEach((node) => {
      const role = Object.keys(ROLE_ICON_MARKUP).find((r) =>
        node.classList.contains(r),
      );
      if (!role) return;
      const rect = node.querySelector("rect");
      if (!rect) return;
      const x = Number.parseFloat(rect.getAttribute("x") ?? "");
      const y = Number.parseFloat(rect.getAttribute("y") ?? "");
      if (Number.isNaN(x) || Number.isNaN(y)) return;
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "role-icon");
      g.setAttribute("transform", `translate(${x + 5}, ${y + 4}) scale(0.42)`);
      g.setAttribute("fill", "none");
      g.setAttribute("stroke", ROLE_ICON_COLOR[role]);
      g.setAttribute("stroke-width", "2");
      g.setAttribute("stroke-linecap", "round");
      g.setAttribute("stroke-linejoin", "round");
      g.innerHTML = ROLE_ICON_MARKUP[role];
      node.appendChild(g);
    });
    return holder.innerHTML;
  } catch {
    return svg;
  }
}

/** Append the shared role classDefs for tags the flowchart uses but doesn't define. */
function withRoleClasses(source: string): string {
  if (!/^\s*(flowchart|graph)\b/.test(source)) return source;
  const needed = Object.entries(ROLE_CLASS_DEFS)
    .filter(([role]) => source.includes(`:::${role}`))
    .filter(([role]) => !new RegExp(`classDef\\s+${role}\\b`).test(source))
    .map(([, def]) => def);
  return needed.length ? `${source}\n  ${needed.join("\n  ")}` : source;
}

let exportRenderCount = 0;

/**
 * Render mermaid source to a self-contained SVG string for download. On-screen
 * rendering uses HTML labels (<foreignObject>), which would taint a canvas and
 * break outside the app's CSS — so exports re-render with pure-SVG labels and
 * strip inline styling tags (which SVG text mode would show literally).
 */
export async function renderDiagramForExport(
  source: string,
): Promise<string | null> {
  const mermaid = await loadMermaid();
  const plain = withRoleClasses(source).replace(/<\/?(i|b|em|strong)>/g, "");
  const directive =
    '%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n';
  try {
    exportRenderCount += 1;
    const { svg } = await mermaid.render(
      `mermaid-export-${exportRenderCount}`,
      directive + plain,
    );
    return decorateRoleIcons(svg);
  } catch {
    document.getElementById(`mermaid-export-${exportRenderCount}`)?.remove();
    return null;
  }
}

type RenderState =
  | { status: "idle" }
  | { status: "rendered"; svg: string }
  | { status: "invalid" };

/**
 * Renders mermaid source into an inline SVG. Invalid syntax degrades to a
 * plain code block — it must never crash the page. Shared by the blueprint
 * detail/preview (chunk 07) and the workplan DAG (chunk 09).
 */
export function MermaidDiagram({
  source,
  className,
  onRendered,
}: {
  source: string;
  className?: string;
  /** Fires after the SVG is in the DOM — e.g. to fit it into a pan/zoom viewport. */
  onRendered?: () => void;
}) {
  const [state, setState] = useState<RenderState>({ status: "idle" });
  // mermaid.render needs a document-unique, CSS-selector-safe element id.
  const renderId = `mermaid-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  // Genuine side effect: drives the non-React mermaid renderer.
  useEffect(() => {
    if (!source.trim()) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(renderId, withRoleClasses(source));
        if (!cancelled)
          setState({ status: "rendered", svg: decorateRoleIcons(svg) });
      } catch {
        // On failure mermaid may leave a temp error element behind — clean it up.
        document.getElementById(renderId)?.remove();
        if (!cancelled) setState({ status: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, renderId]);

  // Genuine side effect: notify consumers once the SVG is committed to the DOM.
  useEffect(() => {
    if (state.status === "rendered") onRendered?.();
  }, [state, onRendered]);

  if (!source.trim() || state.status === "idle") return null;

  if (state.status === "invalid") {
    return (
      <pre className={className}>
        <code className="block overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
          {source}
        </code>
      </pre>
    );
  }

  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the SVG comes from mermaid's renderer (strict security level), not raw user HTML.
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
