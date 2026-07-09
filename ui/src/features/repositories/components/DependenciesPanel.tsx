import { ExternalLinkIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import type { Dependency, DependencyFreshnessItem } from "@/lib/api";
import {
  useDependencyFreshnessQuery,
  useGenerateDependencyFreshnessMutation,
} from "../api";
import { UpgradeGapBadge } from "./UpgradeGapBadge";

export function DependenciesPanel({
  repoId,
  dependencies,
}: {
  repoId: string;
  dependencies: Dependency[];
}) {
  const { t } = useTranslation();
  const { data: freshness } = useDependencyFreshnessQuery(repoId);
  const { mutate: check, isPending: checking } =
    useGenerateDependencyFreshnessMutation(repoId);

  const freshByName = useMemo(() => {
    const map = new Map<string, DependencyFreshnessItem>();
    for (const item of freshness?.items ?? []) map.set(item.name, item);
    return map;
  }, [freshness]);

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="flex flex-row items-center justify-between gap-4 p-6 pb-0">
        <CardTitle>
          {t("repositories.view.dependencies_title")}
          {dependencies.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({dependencies.length})
            </span>
          ) : null}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={checking || dependencies.length === 0}
          onClick={() =>
            check(undefined, {
              onSuccess: () =>
                toast.success(t("repositories.view.dep_freshness_toast")),
            })
          }
        >
          {checking ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
          {checking
            ? t("repositories.view.dep_checking")
            : freshness?.generated
              ? t("repositories.view.dep_recheck")
              : t("repositories.view.dep_check")}
        </Button>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        {dependencies.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {t("repositories.view.dependencies_empty")}
          </p>
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("repositories.view.dep_name")}</TableHead>
                  <TableHead>{t("repositories.view.dep_version")}</TableHead>
                  <TableHead>{t("repositories.view.dep_latest")}</TableHead>
                  <TableHead>{t("repositories.view.dep_gain")}</TableHead>
                  <TableHead>{t("repositories.view.dep_ecosystem")}</TableHead>
                  <TableHead>{t("repositories.view.dep_scope")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dependencies.map((dep, i) => {
                  const fresh = freshByName.get(dep.name);
                  return (
                    <TableRow key={`${dep.name}-${dep.manifest_file}-${i}`}>
                      <TableCell className="align-top font-medium">
                        {dep.name}
                      </TableCell>
                      <TableCell className="align-top font-mono text-xs text-muted-foreground">
                        {dep.version ?? "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        {fresh?.latest ? (
                          <span className="flex items-center gap-2">
                            {fresh.latest_url ? (
                              <a
                                href={fresh.latest_url}
                                target="_blank"
                                rel="noreferrer"
                                className="group inline-flex items-center gap-1 font-mono text-xs hover:text-foreground hover:underline"
                                title={t("repositories.view.dep_changelog")}
                              >
                                {fresh.latest}
                                <ExternalLinkIcon className="size-3 opacity-50 group-hover:opacity-100" />
                              </a>
                            ) : (
                              <span className="font-mono text-xs">
                                {fresh.latest}
                              </span>
                            )}
                            <UpgradeGapBadge gap={fresh.gap} />
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="w-80 whitespace-normal text-xs leading-relaxed text-muted-foreground">
                          {fresh?.gain ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell className="align-top text-muted-foreground">
                        {dep.ecosystem}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={dep.is_dev ? "secondary" : "outline"}>
                          {dep.is_dev
                            ? t("repositories.view.dep_dev")
                            : t("repositories.view.dep_prod")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
