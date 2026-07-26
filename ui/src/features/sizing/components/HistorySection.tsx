import { getRouteApi } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import {
  formatBytesFromGB,
  formatCurrency,
  formatNumber,
} from "@/lib/formatters";
import {
  type CapacityCalculationOut,
  useCapacityCalculationsQuery,
  useDeleteCapacityCalculationMutation,
} from "../api";
import { computeSizing, type SizingInputs, type SizingResults } from "../calc";
import { parseSavedInputs } from "../schemas";

const route = getRouteApi("/capacity-planner");

/** Saved calculations, newest first, with headline outputs recomputed client-side. */
export function HistorySection() {
  const { t } = useTranslation();
  const { data: calculations, isPending } = useCapacityCalculationsQuery();

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const sorted = [...(calculations ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("sizing.history.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((calculation) => (
        <HistoryRow key={calculation.id} calculation={calculation} />
      ))}
    </div>
  );
}

function HistoryRow({ calculation }: { calculation: CapacityCalculationOut }) {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const { mutate: deleteCalculation, isPending: isDeleting } =
    useDeleteCapacityCalculationMutation();

  // Recompute headline outputs from the stored inputs; the backend only
  // persists inputs. Malformed payloads degrade to "no metrics" not a crash.
  let inputs: SizingInputs | null = null;
  let results: SizingResults | null = null;
  try {
    inputs = parseSavedInputs(calculation.inputs);
    results = computeSizing(inputs);
  } catch {
    // Leave metrics empty; the row still renders name/date/actions.
  }

  const load = () => {
    if (!inputs) return;
    navigate({
      to: "/capacity-planner",
      search: { tab: "calculator", ...inputs },
    });
  };

  const handleDelete = () => {
    deleteCalculation(calculation.id, {
      onSuccess: () => toast.success(t("sizing.history.deleted")),
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{calculation.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(calculation.created_at)}
        </span>
      </div>

      {results && (
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <HeadlineMetric
            label={t("sizing.history.stored")}
            value={formatBytesFromGB(results.storage.storedHotGb)}
          />
          <HeadlineMetric
            label={t("sizing.history.monthly_cost")}
            value={formatCurrency(results.cost.totalMonthly)}
          />
          <HeadlineMetric
            label={t("sizing.history.total_nodes")}
            value={formatNumber(results.compute.totalNodes)}
          />
        </dl>
      )}

      <div className="flex items-center gap-1">
        {inputs && (
          <Button variant="outline" size="sm" onClick={load}>
            {t("sizing.history.load")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("sizing.history.delete")}
          disabled={isDeleting}
          onClick={handleDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}

function HeadlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
