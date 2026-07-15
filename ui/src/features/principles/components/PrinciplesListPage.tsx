import { PlusIcon, ScaleIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PrincipleOut } from "@/lib/api";
import { useDeletePrincipleMutation, usePrinciplesQuery } from "../api";
import { SeverityBadge } from "./badges";
import { PrincipleDialog } from "./PrincipleDialog";

export function PrinciplesListPage() {
  const { t } = useTranslation();
  const { data: principles, isPending } = usePrinciplesQuery();

  if (isPending) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <PrincipleDialog
          trigger={
            <Button size="sm">
              <PlusIcon className="size-3.5" />
              {t("principles.list.new")}
            </Button>
          }
        />
      </div>

      {(principles?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ScaleIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("principles.list.empty_title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("principles.list.empty_body")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {principles?.map((p) => (
            <PrincipleCard key={p.id} principle={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrincipleCard({ principle }: { principle: PrincipleOut }) {
  const { t } = useTranslation();
  const { mutate: deletePrinciple } = useDeletePrincipleMutation();

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-medium">{principle.name}</span>
          <SeverityBadge severity={principle.severity} />
          {!principle.enabled ? (
            <Badge variant="outline" className="text-muted-foreground">
              {t("principles.list.disabled")}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <PrincipleDialog
            principle={principle}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("principles.list.edit")}
              >
                <SquarePenIcon className="size-4 text-muted-foreground" />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("principles.list.delete")}
            onClick={() =>
              deletePrinciple(principle.id, {
                onSuccess: () => toast.success(t("principles.list.deleted")),
              })
            }
          >
            <Trash2Icon className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {principle.statement}
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {principle.upheld_count + principle.violated_count > 0
          ? t("principles.list.standing", {
              upheld: principle.upheld_count,
              violated: principle.violated_count,
            })
          : t("principles.list.never_audited")}
      </p>
    </Card>
  );
}
