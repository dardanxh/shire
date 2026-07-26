import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { TECH_CHOOSER_TABS } from "../schemas";
import { ChooserPage } from "./ChooserPage";
import { HistorySection } from "./HistorySection";

const route = getRouteApi("/tech-chooser");

/** Tabbed shell: the stateless chooser plus saved-decision history. */
export function TechChooserPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const { tab: activeTab } = route.useSearch();

  return (
    <div className="flex flex-col gap-6">
      {/* Border-b button tab strip (same pattern as the capacity planner). */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {TECH_CHOOSER_TABS.map((tab) => (
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
              {t(`techchoice.tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "chooser" ? <ChooserPage /> : <HistorySection />}
    </div>
  );
}
