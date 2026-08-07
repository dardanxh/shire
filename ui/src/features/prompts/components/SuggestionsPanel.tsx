import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { PromptSuggestionOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isArtefactActive, useCreatePromptVersionMutation } from "../api";
import { applyHunks, changedHunks, diffWords } from "../diff";
import { DiffPreview } from "./DiffPreview";

/**
 * Preview a proposed rewrite, keep the parts you want, and merge them into a new version.
 *
 * The accept/reject units come from a deterministic word diff rather than from the model, so
 * "accept everything" is byte-identical to the model's rewrite and "accept nothing" is
 * byte-identical to what you started with. The model's own notes on what it changed sit alongside
 * as explanation, not as the merge mechanism.
 *
 * It collapses because it lives inside the editor, directly under the button that fills it. The
 * caller keys this component on the suggestion id, so a fresh proposal arrives with a clean
 * accept/reject slate rather than inheriting positional decisions made about the previous one.
 */
export function SuggestionsPanel({
  promptId,
  currentBody,
  suggestions,
  onMerged,
}: {
  promptId: string;
  currentBody: string;
  suggestions: PromptSuggestionOut[];
  onMerged: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: saveVersion, isPending: isSaving } =
    useCreatePromptVersionMutation(promptId);

  // Newest first from the API.
  const latest = suggestions[0];
  const rewritten = latest?.rewritten_body ?? "";

  const hunks = useMemo(
    () => (rewritten ? diffWords(currentBody, rewritten) : []),
    [currentBody, rewritten],
  );
  const changed = useMemo(() => changedHunks(hunks), [hunks]);

  // Everything starts accepted: the common case is "this rewrite is better, take it", and opting
  // out of the few you dislike is less work than opting in to the rest.
  const allIds = useMemo(
    () => new Set(changed.map((hunk) => hunk.id)),
    [changed],
  );
  const [rejected, setRejected] = useState<ReadonlySet<number>>(new Set());
  const accepted = useMemo(
    () => new Set([...allIds].filter((id) => !rejected.has(id))),
    [allIds, rejected],
  );

  const merged = useMemo(() => applyHunks(hunks, accepted), [hunks, accepted]);
  const hasChanges = accepted.size > 0;

  const isRunning = latest !== undefined && isArtefactActive(latest.status);
  /**
   * Open state follows the data until the user overrides it: a rewrite that lands while you are
   * typing opens itself, because a collapsed section is easy to miss and the whole point is to
   * review it. Deriving it this way rather than syncing with an effect keeps one source of truth.
   */
  const [override, setOverride] = useState<boolean>();
  const open = override ?? (latest !== undefined && !isRunning);

  const toggle = (id: number) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleMerge = () => {
    if (!latest) return;
    saveVersion(
      {
        body: merged,
        source: "suggestion_merge",
        from_suggestion_id: latest.id,
        note:
          rejected.size === 0
            ? t("prompts.suggestions.note_all")
            : t("prompts.suggestions.note_partial", {
                accepted: accepted.size,
                total: changed.length,
              }),
      },
      {
        onSuccess: (version) => {
          toast.success(t("prompts.editor.saved", { number: version.number }));
          setRejected(new Set());
          onMerged();
        },
      },
    );
  };

  // One line on the collapsed header, so the section reports itself without being opened.
  let status: string;
  if (!latest) status = t("prompts.suggestions.none_yet");
  else if (isRunning) status = t("prompts.suggestions.running");
  else if (latest.status === "failed") status = t("prompts.suggestions.failed");
  else if (changed.length === 0) status = t("prompts.suggestions.identical");
  else
    status = t("prompts.suggestions.accepted_count", {
      accepted: accepted.size,
      total: changed.length,
    });

  let body: ReactNode;
  if (!latest) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t("prompts.suggestions.empty_body")}
      </p>
    );
  } else if (isRunning) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t("prompts.suggestions.running_hint", { model: latest.model })}
      </p>
    );
  } else if (latest.status === "failed") {
    body = (
      <p className="text-sm text-destructive">
        {latest.error ?? t("prompts.suggestions.failed_generic")}
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{latest.model}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(latest.finished_at ?? latest.created_at)}
            </span>
          </div>
          {latest.summary ? <Markdown>{latest.summary}</Markdown> : null}
        </div>

        {changed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("prompts.suggestions.identical")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {t("prompts.suggestions.accepted_count", {
                    accepted: accepted.size,
                    total: changed.length,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRejected(new Set())}
                  disabled={rejected.size === 0}
                >
                  {t("prompts.suggestions.accept_all")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRejected(new Set(allIds))}
                  disabled={accepted.size === 0}
                >
                  {t("prompts.suggestions.reject_all")}
                </Button>
              </div>
              <Button onClick={handleMerge} disabled={!hasChanges || isSaving}>
                {isSaving ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <CheckIcon />
                )}
                {t("prompts.suggestions.agree")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("prompts.suggestions.legend")}
            </p>
            <DiffPreview hunks={hunks} accepted={accepted} onToggle={toggle} />

            {latest.changes.length > 0 ? (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <span className="text-sm font-semibold">
                  {t("prompts.suggestions.rationale")}
                </span>
                <ul className="flex flex-col gap-2">
                  {latest.changes.map((change) => (
                    <li key={change.title} className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {change.title}
                        <Badge variant="outline">
                          {t(
                            `prompts.suggestions.dimension.${change.dimension}`,
                          )}
                        </Badge>
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {change.rationale}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="p-0">
      <Collapsible open={open} onOpenChange={setOverride}>
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left">
          {isRunning ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <WandSparklesIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0 text-sm font-semibold">
            {t("prompts.suggestions.proposal")}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {status}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
        </CollapsibleTrigger>

        <CollapsiblePanel className="border-t border-border px-4 py-4">
          {body}
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  );
}
