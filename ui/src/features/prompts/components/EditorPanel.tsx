import { Loader2Icon, SaveIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PromptAnalysisOut } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { ScoreBadge } from "./ScoreBadge";

/**
 * The two text fields the module is built around — Guidance ("how I want this changed") and the
 * Prompt itself — plus the live verdict on the prompt.
 *
 * A plain `<Textarea>` with lifted state rather than a react-hook-form field: this is an editing
 * surface with a Save action, like `AskPanel`, not a CRUD form. The workbench owns the draft so the
 * Checks tab scores exactly what you are looking at, not the last saved version.
 */
export function EditorPanel({
  body,
  guidance,
  note,
  onBodyChange,
  onGuidanceChange,
  onNoteChange,
  analysis,
  isAnalysing,
  isDirty,
  isSaving,
  onSave,
}: {
  body: string;
  guidance: string;
  note: string;
  onBodyChange: (value: string) => void;
  onGuidanceChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  analysis: PromptAnalysisOut | undefined;
  isAnalysing: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="prompt-guidance" className="text-sm font-semibold">
            {t("prompts.editor.guidance_label")}
          </label>
          <p className="text-xs text-muted-foreground">
            {t("prompts.editor.guidance_hint")}
          </p>
        </div>
        <Textarea
          id="prompt-guidance"
          value={guidance}
          onChange={(event) => onGuidanceChange(event.target.value)}
          placeholder={t("prompts.editor.guidance_placeholder")}
          rows={3}
        />
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="prompt-body" className="text-sm font-semibold">
            {t("prompts.editor.body_label")}
          </label>
          <div className="flex items-center gap-2">
            {isAnalysing ? (
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
            <span className="text-xs text-muted-foreground">
              {t("prompts.editor.token_estimate", {
                count: analysis?.estimated_input_tokens ?? 0,
                formatted: formatNumber(analysis?.estimated_input_tokens ?? 0),
              })}
            </span>
            <ScoreBadge score={analysis?.score} />
          </div>
        </div>
        <Textarea
          id="prompt-body"
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder={t("prompts.editor.body_placeholder")}
          rows={18}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">
          {t("prompts.editor.estimate_caveat")}
        </p>
      </Card>

      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <label htmlFor="prompt-note" className="text-sm font-semibold">
            {t("prompts.editor.note_label")}
          </label>
          <Input
            id="prompt-note"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={t("prompts.editor.note_placeholder")}
          />
        </div>
        <Button onClick={onSave} disabled={!isDirty || isSaving}>
          {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          {t("prompts.editor.save")}
        </Button>
      </Card>
    </div>
  );
}
