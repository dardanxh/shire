import { getRouteApi } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTablePagination } from "@/components/shared/DataTablePagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ComplianceCheckOut,
  type ComplianceFindingOut,
  useComplianceChecksQuery,
  useDeleteComplianceCheckMutation,
} from "../api";

const route = getRouteApi("/compliance");

const SIZE_OPTIONS = [10, 20, 50];

const VERDICT_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "secondary"
> = {
  compliant: "success",
  partial: "warning",
  non_compliant: "destructive",
  not_applicable: "secondary",
};

/** Paginated check results; polls while runs are queued (see the query hook). */
export function ResultsSection() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const { page, size } = route.useSearch();

  const { data: checksPage, isPending } = useComplianceChecksQuery({
    page,
    size,
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const checks = checksPage?.items ?? [];
  const total = checksPage?.total ?? 0;

  if (checks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("compliance.results.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {checks.map((check) => (
        <CheckRow key={check.id} check={check} />
      ))}

      {total > SIZE_OPTIONS[0] && (
        <DataTablePagination
          page={page}
          size={size}
          total={total}
          sizeOptions={SIZE_OPTIONS}
          onPageChange={(next) =>
            navigate({ search: (prev) => ({ ...prev, page: next }) })
          }
          onSizeChange={(next) =>
            navigate({ search: (prev) => ({ ...prev, size: next, page: 1 }) })
          }
          labels={{
            pageOf: t("common.pagination.page_of"),
            previous: t("common.pagination.previous"),
            next: t("common.pagination.next"),
            rowsPerPage: t("common.pagination.rows_per_page"),
          }}
        />
      )}
    </div>
  );
}

function CheckRow({ check }: { check: ComplianceCheckOut }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { mutate: deleteCheck, isPending: isDeleting } =
    useDeleteComplianceCheckMutation();

  const handleDelete = () => {
    deleteCheck(check.id, {
      onSuccess: () => toast.success(t("compliance.results.deleted")),
    });
  };

  const hasFindings = check.status === "done" && check.findings.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {check.repository_slug}
          </span>
          <span className="text-sm font-medium">{check.regulation_name}</span>
        </div>

        <CheckStatus check={check} />

        <div className="flex items-center gap-1">
          {hasFindings && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                expanded
                  ? t("compliance.results.findings_hide")
                  : t("compliance.results.findings_show")
              }
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("compliance.results.delete")}
            disabled={isDeleting}
            onClick={handleDelete}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      {check.status === "failed" && check.error && (
        <p className="text-sm text-muted-foreground">{check.error}</p>
      )}

      {check.status === "done" && check.summary && (
        <p className="max-w-prose text-sm text-muted-foreground">
          {check.summary}
        </p>
      )}

      {expanded && hasFindings && (
        <div className="flex flex-col divide-y divide-border rounded-lg border bg-muted/40">
          {check.findings.map((finding) => (
            <FindingRow
              key={`${finding.title}-${finding.article_ref ?? ""}`}
              finding={finding}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckStatus({ check }: { check: ComplianceCheckOut }) {
  const { t } = useTranslation();

  if (check.status === "queued") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {t("compliance.results.status.queued")}
      </span>
    );
  }
  if (check.status === "failed") {
    return (
      <Badge variant="destructive">
        {t("compliance.results.status.failed")}
      </Badge>
    );
  }
  const variant = VERDICT_VARIANT[check.verdict ?? ""] ?? "secondary";
  return (
    <Badge variant={variant}>
      {t(`compliance.results.verdict.${check.verdict ?? "not_applicable"}`)}
    </Badge>
  );
}

function FindingRow({ finding }: { finding: ComplianceFindingOut }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <FindingIcon status={finding.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {finding.title}
          {finding.article_ref && (
            <Badge variant="outline">{finding.article_ref}</Badge>
          )}
        </span>
        {finding.note && (
          <span className="text-sm text-muted-foreground">{finding.note}</span>
        )}
      </div>
    </div>
  );
}

function FindingIcon({ status }: { status: string }) {
  if (status === "ok") {
    return <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />;
  }
  if (status === "gap") {
    return <CircleXIcon className="mt-0.5 size-4 shrink-0 text-destructive" />;
  }
  return (
    <CircleHelpIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  );
}
