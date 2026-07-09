import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

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

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
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
          minScale={0.2}
          maxScale={8}
          centerOnInit
          limitToBounds={false}
          wheel={{ step: 0.15 }}
          doubleClick={{ mode: "reset" }}
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
              </div>
              <TransformComponent
                wrapperClass="!h-full !w-full cursor-grab active:cursor-grabbing"
                contentClass="!h-full !w-full items-center justify-center"
              >
                <MermaidDiagram
                  code={mermaid}
                  className="overflow-visible p-8 [&_svg]:max-w-none"
                />
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
