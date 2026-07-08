import {
  ActivityIcon,
  Building2Icon,
  FileCode2Icon,
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
} from "lucide-react";
import type { ReactNode } from "react";

import type { RepositoryTab } from "../../tabs";
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
};

export const DEFAULT_INTEGRATION_ICON = PuzzleIcon;

export function integrationIcon(id: string): LucideIcon {
  return INTEGRATION_ICONS[id] ?? DEFAULT_INTEGRATION_ICON;
}

/** Rich detail renderers for standalone artifact/data tools, keyed by integration id. */
export const INTEGRATION_DETAIL: Record<string, (repoId: string) => ReactNode> =
  {
    emerge: (id) => <CodebaseGraph id={id} />,
    "git-of-theseus": (id) => <CodeAge id={id} />,
    "code-maat": (id) => <Coupling id={id} />,
    codecharta: (id) => <CodeMap id={id} />,
  };

/** For scorecard tools: which repo tab their contributed data is surfaced in. */
export const SCORECARD_TAB: Record<string, RepositoryTab> = {
  scc: "code",
  lizard: "code",
  radon: "code",
  syft: "dependencies",
  "osv-scanner": "security",
  gitleaks: "security",
  scorecard: "security",
};
