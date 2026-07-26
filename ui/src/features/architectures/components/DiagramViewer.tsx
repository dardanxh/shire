import { Link } from "@tanstack/react-router";
import {
  FileCodeIcon,
  ImageDownIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  ScanIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
  useControls,
} from "react-zoom-pan-pinch";

import {
  MermaidDiagram,
  renderDiagramForExport,
} from "@/components/shared/MermaidDiagram";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Render the source as a self-contained SVG and download it as SVG or 2x PNG. */
async function downloadDiagram(
  source: string,
  filename: string,
  format: "svg" | "png",
) {
  const markup = await renderDiagramForExport(source);
  if (!markup) return;
  // Give the SVG explicit pixel dimensions (mermaid emits width:100%) so it has
  // an intrinsic size both as a standalone file and when rasterized below.
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  const svg = holder.querySelector("svg");
  if (!svg) return;
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1, Math.ceil(viewBox?.width || 800));
  const height = Math.max(1, Math.ceil(viewBox?.height || 600));
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.style.maxWidth = "";
  const serialized = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  if (format === "svg") {
    triggerDownload(blob, `${filename}.svg`);
    return;
  }
  // PNG: rasterize the SVG at 2x through a canvas.
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((png) => {
      if (png) triggerDownload(png, `${filename}.png`);
    }, "image/png");
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

/** Zoom buttons — must live inside the TransformWrapper context. */
function ZoomControls({
  onFit,
  onExport,
}: {
  onFit: () => void;
  onExport: (format: "svg" | "png") => void;
}) {
  const { t } = useTranslation();
  const { zoomIn, zoomOut } = useControls();
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col rounded-md border bg-background shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("blueprints.diagram.zoom_in")}
        onClick={() => zoomIn()}
      >
        <PlusIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("blueprints.diagram.zoom_out")}
        onClick={() => zoomOut()}
      >
        <MinusIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("blueprints.diagram.zoom_reset")}
        onClick={onFit}
      >
        <ScanIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("blueprints.diagram.export_svg")}
        onClick={() => onExport("svg")}
      >
        <FileCodeIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("blueprints.diagram.export_png")}
        onClick={() => onExport("png")}
      >
        <ImageDownIcon />
      </Button>
    </div>
  );
}

/**
 * Pan/zoom viewport around a Mermaid diagram. The wrapper is overflow-hidden, so
 * a wide diagram pans/zooms inside its box instead of stretching the page into a
 * horizontal scroll. `fullscreenId` adds an "open in its own page" button.
 */
export function DiagramViewer({
  source,
  fullscreenId,
  fullscreenView,
  exportName = "diagram",
  className,
}: {
  source: string;
  /** Blueprint id — when set, shows a button linking to /architectures/$id/diagram. */
  fullscreenId?: string;
  /** Diagram kind carried into the fullscreen route's `view` search param. */
  fullscreenView?: string;
  /** Filename base for SVG/PNG downloads. */
  exportName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const apiRef = useRef<ReactZoomPanPinchRef>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Zoom-out floor = the scale where the whole diagram fits the viewport, so
  // zooming out stops at the full-diagram view instead of shrinking forever.
  const [minScale, setMinScale] = useState(0.05);

  // Fit the rendered diagram into the viewport — on first render and via the
  // reset button. Targets the wrapper div, which hugs the SVG.
  const fit = useCallback(() => {
    if (contentRef.current?.querySelector("svg")) {
      apiRef.current?.zoomToElement(contentRef.current, undefined, 0);
      const scale = apiRef.current?.instance.state.scale;
      if (scale) setMinScale(scale);
    }
  }, []);

  // Genuine side effect: a native non-passive wheel listener so two-finger
  // trackpad scroll PANS the canvas (design-tool behavior). Pinch arrives as
  // ctrl+wheel on macOS and stays with the library's zoom handler.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const api = apiRef.current;
      if (!api) return;
      const { positionX, positionY, scale } = api.instance.state;
      const bounds = api.instance.bounds;
      let x = positionX - event.deltaX;
      let y = positionY - event.deltaY;
      if (bounds) {
        x = Math.min(Math.max(x, bounds.minPositionX), bounds.maxPositionX);
        y = Math.min(Math.max(y, bounds.minPositionY), bounds.maxPositionY);
      }
      api.setTransform(x, y, scale, 0);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-white",
        className,
      )}
    >
      <TransformWrapper
        ref={apiRef}
        minScale={minScale}
        maxScale={10}
        // Plain wheel pans (handler above); only pinch/ctrl+wheel zooms.
        wheel={{ step: 0.15, wheelDisabled: true }}
      >
        <ZoomControls
          onFit={fit}
          onExport={(format) =>
            void downloadDiagram(source, exportName, format)
          }
        />
        {/* Absolutely positioned so the diagram's natural width never contributes
            to intrinsic sizing (which would push the page into horizontal scroll —
            overflow-hidden clips paint but not min-content). */}
        <TransformComponent
          wrapperClass="!absolute !inset-0 !h-full !w-full cursor-grab active:cursor-grabbing"
          contentClass="p-6"
        >
          <div ref={contentRef}>
            <MermaidDiagram source={source} onRendered={fit} />
          </div>
        </TransformComponent>
      </TransformWrapper>
      {fullscreenId && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute top-3 right-3 z-10 bg-background/95 shadow-sm backdrop-blur"
          render={
            <Link
              to="/architectures/$id/diagram"
              params={{ id: fullscreenId }}
              search={{ view: fullscreenView }}
            />
          }
        >
          <MaximizeIcon />
          {t("blueprints.diagram.fullscreen")}
        </Button>
      )}
    </div>
  );
}
