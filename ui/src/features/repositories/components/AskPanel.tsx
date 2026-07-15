import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  MessageCircleQuestionIcon,
  SendIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { JobStatusBadge } from "@/features/jobs";
import type { QuestionOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAskQuestionMutation, useRepoQuestionsQuery } from "../api";

const RUNNING = new Set(["pending", "running"]);

/**
 * Ask the repository anything: each question becomes an engine job that explores the clone
 * (grounded by the context pack) and the answer lands here when it settles. The questions
 * query polls while any answer is in flight.
 */
export function AskPanel({ repoId }: { repoId: string }) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const { data: questions } = useRepoQuestionsQuery(repoId);
  const { mutate: ask, isPending: asking } = useAskQuestionMutation(repoId);

  const submit = () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    ask(trimmed, { onSuccess: () => setQuestion("") });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="space-y-3 p-4">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("repositories.ask.placeholder")}
          rows={3}
          disabled={asking}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {t("repositories.ask.hint")}
          </p>
          <Button
            size="sm"
            onClick={submit}
            disabled={asking || !question.trim()}
          >
            {asking ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SendIcon className="size-3.5" />
            )}
            {t("repositories.ask.submit")}
          </Button>
        </div>
      </Card>

      {(questions?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <MessageCircleQuestionIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("repositories.ask.empty_title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("repositories.ask.empty_body")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions?.map((q) => (
            <QuestionCard key={q.job_id} item={q} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ item }: { item: QuestionOut }) {
  const { t } = useTranslation();
  // Collapsed by default — the tab is a scannable list of questions; the answer expands on click.
  const [open, setOpen] = useState(false);
  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left"
      >
        <span className="inline-flex items-start gap-2">
          {open ? (
            <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium">{item.question}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDateTime(item.created_at)}</span>
          <JobStatusBadge status={item.status} />
        </span>
      </button>
      {open ? (
        <div className="border-t border-border px-5 py-4">
          {RUNNING.has(item.status) ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              {t("repositories.ask.answering")}
            </p>
          ) : item.answer ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {item.answer}
            </p>
          ) : (
            <p className="text-sm text-destructive">
              {item.error ?? t("repositories.ask.no_answer")}
            </p>
          )}
          {item.duration_seconds != null || item.total_tokens != null ? (
            <p className="mt-3 text-xs tabular-nums text-muted-foreground">
              {t("repositories.ask.meta", {
                seconds: (item.duration_seconds ?? 0).toFixed(1),
                tokens: item.total_tokens ?? 0,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
