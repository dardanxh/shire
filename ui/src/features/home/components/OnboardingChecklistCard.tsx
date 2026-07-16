import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2Icon, CircleIcon, PartyPopperIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HomeStatusOut } from "@/lib/api";
import { cn } from "@/lib/utils";

const CLAUDE_INSTALL_URL = "https://code.claude.com/docs/en/quickstart";

type Item = {
  key: string;
  done: boolean;
  onCta?: () => void;
  ctaDisabledHint?: string;
};

/**
 * The onboarding checklist. Every state is DERIVED from live data, so items
 * complete themselves no matter where in the app the work happens — and the
 * card self-reopens if the underlying data disappears.
 */
export function OnboardingChecklistCard({ status }: { status: HomeStatusOut }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { claude, checklist } = status;
  const firstRepoId = checklist.first_repository_id;

  const items: Item[] = [
    {
      key: "claude",
      done: claude.installed,
      onCta: () => window.open(CLAUDE_INSTALL_URL, "_blank", "noreferrer"),
    },
    {
      key: "repository",
      done: checklist.repository_count > 0,
      onCta: () =>
        navigate({
          to: "/repositories",
          search: { view: "repositories", page: 1, size: 20, wizard: true },
        }),
    },
    {
      key: "connection",
      done: checklist.connection_count > 0,
      onCta: () =>
        navigate({ to: "/connectors", search: { tab: "connectors" } }),
    },
    {
      key: "tool",
      done: checklist.has_linked_tool,
      onCta: firstRepoId
        ? () =>
            navigate({
              to: "/repositories/$id",
              params: { id: firstRepoId },
              search: { tab: "integrations", tool: undefined },
            })
        : undefined,
      ctaDisabledHint: firstRepoId
        ? undefined
        : t("home.checklist.needs_repo_hint"),
    },
    {
      key: "hobit",
      done: checklist.has_hobit_run,
      onCta: firstRepoId
        ? () =>
            navigate({
              to: "/repositories/$id",
              params: { id: firstRepoId },
              search: { tab: "hobits", tool: undefined },
            })
        : undefined,
      ctaDisabledHint: firstRepoId
        ? undefined
        : t("home.checklist.needs_repo_hint"),
    },
    {
      key: "principle",
      done: checklist.principle_count > 0,
      onCta: () => navigate({ to: "/principles" }),
    },
  ];

  const doneCount = items.filter((item) => item.done).length;
  const allDone = doneCount === items.length;

  if (allDone) {
    return (
      <Card className="flex-row items-center gap-3 p-5">
        <PartyPopperIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-sm font-semibold">
            {t("home.checklist.done_title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("home.checklist.done_body")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t("home.checklist.title")}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("home.checklist.progress", {
            done: doneCount,
            total: items.length,
          })}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }}
        />
      </div>

      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-md px-2 py-2.5",
              !item.done && "hover:bg-muted/40",
            )}
          >
            {item.done ? (
              <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CircleIcon className="size-5 shrink-0 text-muted-foreground/50" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.done && "text-muted-foreground line-through",
                )}
              >
                {t(`home.checklist.items.${item.key}.title`)}
              </p>
              {!item.done ? (
                <p className="text-xs text-muted-foreground">
                  {t(`home.checklist.items.${item.key}.description`)}
                </p>
              ) : null}
            </div>
            {!item.done ? (
              <Button
                variant="outline"
                size="sm"
                onClick={item.onCta}
                disabled={!item.onCta}
                title={item.ctaDisabledHint}
              >
                {t(`home.checklist.items.${item.key}.cta`)}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
