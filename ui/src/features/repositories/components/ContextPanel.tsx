import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ContextMarkdownOut } from "@/lib/api";
import { formatDateTime, shortSha } from "@/lib/format";
import {
  useContextMarkdownQuery,
  useResetContextMarkdownMutation,
  useSaveContextMarkdownMutation,
} from "../api";
import { OnboardingRunner } from "./OnboardingRunner";

/**
 * The "Context" tab: the repository's context pack as an editable Markdown document.
 * The generated text is what an agent reads first; the user can edit it and save an
 * override (persisted, and what the agent then reads), or reset back to the generated one.
 */
export function ContextPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const { data: markdown, isPending } = useContextMarkdownQuery(repoId);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[28rem] w-full" />
      </div>
    );
  }

  if (!markdown) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("repositories.view.pending_body")}
      </p>
    );
  }

  // Keyed by repo so switching repositories re-seeds the editor; within a repo the draft
  // persists across refetches (the editor tracks dirtiness against the live query data).
  return (
    <div className="space-y-6">
      <OnboardingRunner repoId={repoId} />
      {markdown.narrative ? (
        <MentalModel narrative={markdown.narrative} />
      ) : null}
      <MarkdownEditor key={repoId} repoId={repoId} markdown={markdown} />
    </div>
  );
}

/**
 * The hobit-authored L3 mental model — shown on its own, always visible even when the pack
 * Markdown below has been overridden. Read-only Markdown source.
 */
function MentalModel({ narrative }: { narrative: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hobits.run.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          value={narrative}
          readOnly
          spellCheck={false}
          className="min-h-[20rem] font-mono text-xs leading-relaxed"
        />
      </CardContent>
    </Card>
  );
}

function MarkdownEditor({
  repoId,
  markdown,
}: {
  repoId: string;
  markdown: ContextMarkdownOut;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(markdown.effective);

  const { mutate: save, isPending: saving } =
    useSaveContextMarkdownMutation(repoId);
  const { mutate: reset, isPending: resetting } =
    useResetContextMarkdownMutation(repoId);

  const isDirty = draft !== markdown.effective;

  const handleSave = () => {
    save(draft, {
      onSuccess: () =>
        toast.success(t("repositories.view.context.saved_toast")),
    });
  };

  const handleReset = () => {
    reset(undefined, {
      onSuccess: (data) => {
        setDraft(data.generated);
        toast.success(t("repositories.view.context.reset_toast"));
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {t("repositories.view.context.intro")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("repositories.view.context.generated_meta", {
            when: formatDateTime(markdown.generated_at),
            sha: shortSha(markdown.commit_sha),
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {t("repositories.view.context.editor_label")}
          </span>
          {markdown.is_edited ? (
            <Badge variant="secondary">
              {t("repositories.view.context.edited_badge")}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(markdown.effective)}
              disabled={saving || resetting}
            >
              {t("repositories.view.context.revert")}
            </Button>
          ) : null}
          {markdown.is_edited ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving || resetting}
            >
              {t("repositories.view.context.reset")}
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving || resetting}
          >
            {saving
              ? t("repositories.view.context.saving")
              : t("repositories.view.context.save")}
          </Button>
        </div>
      </div>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        className="min-h-[32rem] font-mono text-xs leading-relaxed"
      />

      <p className="text-xs text-muted-foreground">
        {t("repositories.view.context.hint")}
      </p>
    </div>
  );
}
