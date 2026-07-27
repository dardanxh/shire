import { getRouteApi } from "@tanstack/react-router";
import { RotateCcwIcon, SaveIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SIZING_DEFAULTS } from "../calc";
import { CAPACITY_PLANNER_TABS, searchToInputs } from "../schemas";
import { CalculatorPage } from "./CalculatorPage";
import { HistorySection } from "./HistorySection";
import { SaveCalculationDialog } from "./SaveCalculationDialog";

const route = getRouteApi("/capacity-planner");

/** Tabbed shell: the stateless calculator plus saved-calculation history. */
export function CapacityPlannerPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();
  const { tab: activeTab } = search;
  const [saveOpen, setSaveOpen] = useState(false);

  // The URL is the calculator's durable state, so Reset/Save can live up here:
  // CalculatorPage re-syncs its draft whenever the URL changes from outside.
  const reset = () =>
    navigate({
      search: (prev) => ({ ...prev, ...SIZING_DEFAULTS }),
      replace: true,
    });

  return (
    <div className="flex flex-col gap-6">
      {/* One row: tabs left, calculator actions right. */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {CAPACITY_PLANNER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => navigate({ search: (prev) => ({ ...prev, tab }) })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`sizing.tabs.${tab}`)}
            </button>
          ))}
        </div>
        {activeTab === "calculator" ? (
          <div className="flex items-center gap-2 pb-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcwIcon />
              {t("sizing.actions.reset")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveOpen(true)}
            >
              <SaveIcon />
              {t("sizing.actions.save")}
            </Button>
          </div>
        ) : null}
      </div>

      <SaveCalculationDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        inputs={searchToInputs(search)}
      />

      {activeTab === "calculator" ? <CalculatorPage /> : <HistorySection />}
    </div>
  );
}
