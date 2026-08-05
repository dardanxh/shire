import mermaid from "mermaid";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

let initialized = false;
function ensureInitialized() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "strict",
    fontFamily: "inherit",
    // Without this, a diagram that fails to parse leaves mermaid's own giant
    // "Syntax error in text / mermaid version x" SVG behind in <body> — it
    // throws before cleaning up its temp container. We render our own message.
    suppressErrorRendering: true,
  });
  initialized = true;
}

/**
 * Renders a Mermaid source string to SVG. Mermaid is an imperative, non-React
 * library that parses + renders asynchronously and throws on invalid syntax —
 * a genuine side effect, so it lives in an effect keyed on the source.
 */
export function MermaidDiagram({
  code,
  className,
  onRendered,
}: {
  code: string;
  className?: string;
  /** Fires after the SVG is in the DOM — e.g. to fit it into a pan/zoom viewport. */
  onRendered?: () => void;
}) {
  const { t } = useTranslation();
  // Mermaid needs a DOM-id-safe handle; React's useId yields colons we must strip.
  const domId = `mermaid-${useId().replace(/:/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureInitialized();
    mermaid
      .render(domId, code)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        setSvg(rendered);
        setFailed(false);
      })
      .catch(() => {
        // Belt and braces: drop mermaid's temp container if it survived.
        document.getElementById(domId)?.remove();
        document.getElementById(`d${domId}`)?.remove();
        if (cancelled) return;
        setSvg(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, domId]);

  // Genuine side effect: notify consumers once the SVG is committed to the DOM.
  useEffect(() => {
    if (svg) onRendered?.();
  }, [svg, onRendered]);

  if (failed) {
    return (
      <p className="text-xs text-destructive">
        {t("repositories.view.architecture.render_error")}
      </p>
    );
  }
  if (!svg) return null;
  return (
    <div
      className={cn(
        "mermaid-diagram overflow-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full",
        className,
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG is produced by Mermaid (securityLevel: strict) from our own generated source.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
