import {
  CheckIcon,
  Loader2Icon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PromptSuggestionOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
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

  const toggle = (id: number) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!latest) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <WandSparklesIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("prompts.suggestions.empty_title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("prompts.suggestions.empty_body")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isArtefactActive(latest.status)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
          <p className="font-medium">{t("prompts.suggestions.running")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("prompts.suggestions.running_hint", { model: latest.model })}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (latest.status === "failed") {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col gap-2 py-6">
          <p className="font-medium text-destructive">
            {t("prompts.suggestions.failed")}
          </p>
          <p className="text-sm text-muted-foreground">
            {latest.error ?? t("prompts.suggestions.failed_generic")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleMerge = () => {
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

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <SparklesIcon className="size-4 text-muted-foreground" />
            <span className="font-medium">
              {t("prompts.suggestions.proposal")}
            </span>
            <Badge variant="outline">{latest.model}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatDateTime(latest.finished_at ?? latest.created_at)}
            </span>
          </div>
          {latest.summary ? <Markdown>{latest.summary}</Markdown> : null}
        </CardContent>
      </Card>

      {changed.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("prompts.suggestions.identical")}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 py-4">
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
                <Button
                  onClick={handleMerge}
                  disabled={!hasChanges || isSaving}
                >
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
              <DiffPreview
                hunks={hunks}
                accepted={accepted}
                onToggle={toggle}
              />
            </CardContent>
          </Card>

          {latest.changes.length > 0 ? (
            <Card>
              <CardContent className="flex flex-col gap-3 py-4">
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
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
