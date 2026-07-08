import { useTranslation } from "react-i18next";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Vulnerability } from "@/lib/api";
import { SeverityBadge } from "./SeverityBadge";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
};

export function VulnerabilitiesTable({
  vulnerabilities,
}: {
  vulnerabilities: Vulnerability[];
}) {
  const { t } = useTranslation();
  const sorted = [...vulnerabilities].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity.toLowerCase()] ?? 99) -
      (SEVERITY_ORDER[b.severity.toLowerCase()] ?? 99),
  );

  return (
    <div className="max-h-[32rem] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("repositories.view.vuln_package")}</TableHead>
            <TableHead>{t("repositories.view.vuln_ecosystem")}</TableHead>
            <TableHead>{t("repositories.view.vuln_version")}</TableHead>
            <TableHead>{t("repositories.view.vuln_id")}</TableHead>
            <TableHead>{t("repositories.view.vuln_severity")}</TableHead>
            <TableHead>{t("repositories.view.vuln_fixed")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((v, i) => (
            <TableRow key={`${v.package}-${v.vuln_id}-${i}`}>
              <TableCell className="font-medium">{v.package}</TableCell>
              <TableCell className="text-muted-foreground">
                {v.ecosystem}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.version ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">{v.vuln_id}</TableCell>
              <TableCell>
                <SeverityBadge severity={v.severity} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.fixed_version ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
