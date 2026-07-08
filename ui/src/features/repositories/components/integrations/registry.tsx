import {
  ActivityIcon,
  BugIcon,
  Building2Icon,
  FileCode2Icon,
  FlaskConicalIcon,
  GaugeIcon,
  HeartPulseIcon,
  HistoryIcon,
  KeyRoundIcon,
  type LucideIcon,
  NetworkIcon,
  PackageIcon,
  PuzzleIcon,
  Share2Icon,
  ShieldAlertIcon,
  SparklesIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { CodeAge } from "../CodeAge";
import { CodebaseGraph } from "../CodebaseGraph";
import { CodeMap } from "../CodeMap";
import { Coupling } from "../Coupling";

/**
 * Presentation registry for the Integrations hub. The catalog itself (which
 * tools exist, what they provide, availability) is backend-driven via GET
 * /tools; this maps each integration id to its icon and — for artifact/data
 * tools — a rich detail view. Scorecard tools fall back to a generic detail.
 *
 * Adding a tool: register it in the backend (id/category/kind on its ToolSpec),
 * then add an icon here and, for a standalone visualization, a detail renderer.
 */

export const INTEGRATION_ICONS: Record<string, LucideIcon> = {
  scc: FileCode2Icon,
  lizard: ActivityIcon,
  radon: GaugeIcon,
  syft: PackageIcon,
  "osv-scanner": ShieldAlertIcon,
  gitleaks: KeyRoundIcon,
  scorecard: HeartPulseIcon,
  emerge: NetworkIcon,
  "git-of-theseus": HistoryIcon,
  "code-maat": Share2Icon,
  codecharta: Building2Icon,
  "test-metrics": FlaskConicalIcon,
  ruff: SparklesIcon,
  bandit: BugIcon,
  vulture: Trash2Icon,
  ownership: UsersIcon,
};

export const DEFAULT_INTEGRATION_ICON = PuzzleIcon;

export function integrationIcon(id: string): LucideIcon {
  return INTEGRATION_ICONS[id] ?? DEFAULT_INTEGRATION_ICON;
}

/** Per-category badge colors — one distinct hue per integration category. */
export const CATEGORY_STYLES: Record<string, string> = {
  visualization:
    "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25",
  history:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  metrics: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  security: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  health:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  analysis:
    "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/25",
  testing: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/25",
  maintenance:
    "bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/25",
};

export function categoryStyle(category: string): string {
  return (
    CATEGORY_STYLES[category] ??
    "bg-muted text-muted-foreground border-foreground/10"
  );
}

/**
 * Language-scope pill styling. "general" (any language) stays neutral; a
 * language-specific tool (e.g. "python") gets a distinct accent so it's obvious
 * the tool only applies to that language.
 */
export const LANGUAGE_STYLES: Record<string, string> = {
  python:
    "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/25",
};

export function languageStyle(language: string): string {
  return (
    LANGUAGE_STYLES[language] ??
    "bg-muted text-muted-foreground border-foreground/10"
  );
}

/** Rich detail renderers for standalone artifact/data tools, keyed by integration id. */
export const INTEGRATION_DETAIL: Record<string, (repoId: string) => ReactNode> =
  {
    emerge: (id) => <CodebaseGraph id={id} />,
    "git-of-theseus": (id) => <CodeAge id={id} />,
    "code-maat": (id) => <Coupling id={id} />,
    codecharta: (id) => <CodeMap id={id} />,
  };
