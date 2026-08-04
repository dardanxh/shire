import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  ScanIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useArchitectureQuery } from "../api";
import { MermaidDiagram } from "./MermaidDiagram";

export function DiagramViewPage({
  repoId,
  kind,
}: {
  repoId: string;
  kind: string;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useArchitectureQuery(repoId);
  const diagram = data?.diagrams.find((d) => d.kind === kind);
  const mermaid = diagram?.mermaid;
  const apiRef = useRef<ReactZoomPanPinchRef>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Zoom-out floor = the scale where the whole diagram fits, so zooming out
  // stops at the full-diagram view instead of shrinking forever.
  const [minScale, setMinScale] = useState(0.05);

  // Fit the whole diagram into the canvas — the default view on open, and the
  // fit button. Floors zoom-out at the fit scale (capped at 1 so the reset
  // button's 100% is always reachable).
  const fit = useCallback(() => {
    if (!contentRef.current?.querySelector("svg")) return;
    apiRef.current?.zoomToElement(contentRef.current, undefined, 0);
    const scale = apiRef.current?.instance.state.scale;
    if (scale) setMinScale(Math.min(scale, 1));
  }, []);

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <Link
          to="/repositories/$id"
          params={{ id: repoId }}
          search={{ tab: "architecture", tool: undefined }}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeftIcon className="size-4" />
          {t("repositories.view.architecture.back")}
        </Link>
        {diagram ? (
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{diagram.title}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {diagram.description}
            </p>
          </div>
        ) : null}
      </div>

      {mermaid ? (
        <TransformWrapper
          ref={apiRef}
          minScale={minScale}
          maxScale={8}
          centerOnInit
          limitToBounds={false}
          wheel={{ step: 0.15 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-muted/20">
              <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={t("repositories.view.architecture.zoom_in")}
                  onClick={() => zoomIn()}
                >
                  <PlusIcon className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={t("repositories.view.architecture.zoom_out")}
                  onClick={() => zoomOut()}
                >
                  <MinusIcon className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={t("repositories.view.architecture.zoom_reset")}
                  onClick={() => resetTransform()}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={t("repositories.view.architecture.zoom_fit")}
                  onClick={fit}
                >
                  <ScanIcon className="size-4" />
                </Button>
              </div>
              {/* Absolutely positioned so the diagram's natural width never
                  contributes to intrinsic sizing (overflow-hidden clips paint,
                  not min-content) — otherwise the page scrolls sideways. */}
              <TransformComponent
                wrapperClass="!absolute !inset-0 !h-full !w-full cursor-grab active:cursor-grabbing"
                contentClass="p-6"
              >
                <div ref={contentRef}>
                  <MermaidDiagram
                    code={mermaid}
                    className="overflow-visible [&_svg]:max-w-none"
                    onRendered={fit}
                  />
                </div>
              </TransformComponent>
            </div>
          )}
        </TransformWrapper>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {isPending
            ? t("repositories.view.architecture.loading")
            : t("repositories.view.architecture.empty")}
        </p>
      )}
    </div>
  );
}
