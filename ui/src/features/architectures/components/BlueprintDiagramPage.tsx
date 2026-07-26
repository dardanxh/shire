import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlueprintQuery } from "../api";
import { DiagramTabs, sortDiagramKinds } from "./DiagramTabs";
import { DiagramViewer } from "./DiagramViewer";

const route = getRouteApi("/architectures/$id/diagram");

/** Full-page pan/zoom view of an architecture's diagrams, switchable by kind. */
export function BlueprintDiagramPage() {
  const { t } = useTranslation();
  const { id } = route.useParams();
  const { view } = route.useSearch();
  const navigate = route.useNavigate();
  const { data: blueprint, isPending, isError } = useBlueprintQuery(id);

  if (isPending) {
    return <Skeleton className="h-[70vh] w-full" />;
  }

  if (isError || !blueprint) {
    return (
      <p className="text-sm text-muted-foreground">{t("common.table.error")}</p>
    );
  }

  const kinds = sortDiagramKinds(blueprint.diagrams.map((d) => d.kind));
  const active = view && kinds.includes(view) ? view : kinds[0];
  const current = blueprint.diagrams.find((d) => d.kind === active);

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/architectures/$id" params={{ id }} />}
        >
          <ChevronLeftIcon />
          {t("blueprints.diagram.back")}
        </Button>
        <h1 className="font-heading text-lg font-semibold">{blueprint.name}</h1>
        <div className="ml-auto">
          <DiagramTabs
            kinds={kinds}
            active={active ?? ""}
            onChange={(kind) =>
              navigate({ search: { view: kind }, replace: true })
            }
          />
        </div>
      </div>
      {current?.mermaid.trim() ? (
        <DiagramViewer
          key={current.kind}
          source={current.mermaid}
          exportName={`${blueprint.slug}-${current.kind}`}
          className="min-h-0 flex-1"
        />
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center rounded-lg border">
          <p className="text-sm text-muted-foreground">
            {t("blueprints.diagram.empty")}
          </p>
        </div>
      )}
    </div>
  );
}
