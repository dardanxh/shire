import { Loader2Icon, Share2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { useCouplingQuery, useGenerateCouplingMutation } from "../api";

/**
 * Temporal (change) coupling from code-maat: files that historically change
 * together, ranked by coupling degree. Surfaces hidden architectural
 * entanglement a static dependency graph can't see.
 */
export function Coupling({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data: coupling, isPending } = useCouplingQuery(id);
  const { mutate: generate, isPending: generating } =
    useGenerateCouplingMutation(id);

  const handleGenerate = () => {
    generate(undefined, {
      onSuccess: () => toast.success(t("repositories.view.coupling_toast")),
    });
  };

  const available = coupling?.tool_available ?? false;
  const pairs = coupling?.pairs ?? [];

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-6 pb-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Share2Icon className="size-4" />
            {t("repositories.view.coupling_title")}
            {pairs.length > 0 ? (
              <span className="text-sm font-normal text-muted-foreground">
                ({pairs.length})
              </span>
            ) : null}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("repositories.view.coupling_desc")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={generating || isPending || !available}
          onClick={handleGenerate}
        >
          {generating ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : null}
          {generating
            ? t("repositories.view.viz_generating")
            : coupling?.generated
              ? t("repositories.view.viz_regenerate")
              : t("repositories.view.viz_generate")}
        </Button>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        {!isPending && !available ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {t("repositories.view.coupling_unavailable")}
          </p>
        ) : !coupling?.generated ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {t("repositories.view.coupling_empty")}
          </p>
        ) : pairs.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {t("repositories.view.coupling_none")}
          </p>
        ) : (
          <>
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("repositories.view.coupling_entity")}
                    </TableHead>
                    <TableHead>
                      {t("repositories.view.coupling_coupled")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("repositories.view.coupling_degree")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairs.map((p) => (
                    <TableRow key={`${p.entity}::${p.coupled}`}>
                      <TableCell className="font-mono text-xs">
                        {p.entity}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.coupled}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {p.degree}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="px-6 py-3 text-xs text-muted-foreground">
              {t("repositories.view.viz_generated_at", {
                when: formatDateTime(coupling?.generated_at ?? null),
              })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
