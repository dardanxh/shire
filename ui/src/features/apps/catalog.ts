import {
  CalculatorIcon,
  type LucideIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";

export type AppEntry = {
  id: string;
  to: string;
  icon: LucideIcon;
  nameKey: string;
  descriptionKey: string;
  /** Required by targets with `validateSearch` (typed links need an explicit search). */
  search: Record<string, unknown>;
};

/**
 * Registry of standalone interactive tools. Drives both the /apps launcher
 * grid and the sidebar's active-state matching — add new apps here, not in
 * the Sidebar.
 */
export const APPS: AppEntry[] = [
  {
    id: "ai-readiness",
    to: "/ai-readiness",
    icon: SparklesIcon,
    nameKey: "apps.catalog.ai_readiness.name",
    descriptionKey: "apps.catalog.ai_readiness.description",
    search: {},
  },
  {
    id: "capacity-planner",
    to: "/capacity-planner",
    icon: CalculatorIcon,
    nameKey: "apps.catalog.capacity_planner.name",
    descriptionKey: "apps.catalog.capacity_planner.description",
    search: {},
  },
  {
    id: "tech-chooser",
    to: "/tech-chooser",
    icon: SlidersHorizontalIcon,
    nameKey: "apps.catalog.tech_chooser.name",
    descriptionKey: "apps.catalog.tech_chooser.description",
    search: {},
  },
  {
    id: "compliance",
    to: "/compliance",
    icon: ShieldCheckIcon,
    nameKey: "apps.catalog.compliance.name",
    descriptionKey: "apps.catalog.compliance.description",
    search: {},
  },
];
