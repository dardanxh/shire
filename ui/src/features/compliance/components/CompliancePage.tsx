import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { COMPLIANCE_TABS } from "../schemas";
import { CheckerSection } from "./CheckerSection";
import { ResultsSection } from "./ResultsSection";

const route = getRouteApi("/compliance");

/** Tabbed shell: pick repositories × standards, then browse check results. */
export function CompliancePage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const { tab: activeTab } = route.useSearch();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{t("compliance.title")}</h1>

      {/* Border-b button tab strip (same pattern as the architectures hub). */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b">
        <div className="flex items-center gap-1">
          {COMPLIANCE_TABS.map((tab) => (
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
              {t(`compliance.tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "checker" ? <CheckerSection /> : <ResultsSection />}
    </div>
  );
}
