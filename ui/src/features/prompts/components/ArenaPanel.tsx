import { GaugeIcon, Loader2Icon, PlayIcon, TrophyIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CollapsibleBlock } from "@/components/shared/CollapsibleBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PROMPT_MODELS, type PromptArenaBatch } from "@/lib/api";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import { isArtefactActive, useStartArenaRunMutation } from "../api";

/** Models offered by default: the three aliases, which track the current release of each tier. */
const DEFAULT_MODELS = ["opus", "sonnet", "haiku"];

function TokenStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Run one prompt against several models at once and let a separate model judge the answers.
 *
 * The token counts here are the only *measured* numbers in the module — everything else is the
 * estimator. Cost is what the call would have been charged at API rates; under the subscription
 * auth the engine uses, nothing is actually billed, so it is labelled indicative.
 */
export function ArenaPanel({
  promptId,
  versionId,
  batches,
}: {
  promptId: string;
  versionId: string;
  batches: PromptArenaBatch[];
}) {
  const { t } = useTranslation();
  const { mutate: startRun, isPending } = useStartArenaRunMutation(
    promptId,
    versionId,
  );
  const [selected, setSelected] = useState<string[]>(DEFAULT_MODELS);
  const [judge, setJudge] = useState(true);

  const running = batches.some((batch) =>
    batch.runs.some((run) => isArtefactActive(run.status)),
  );

  const toggleModel = (model: string) =>
    setSelected((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model],
    );

  const start = () =>
    startRun(
      { models: selected, judge },
      { onSuccess: () => toast.success(t("prompts.arena.started")) },
    );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <p className="text-sm text-muted-foreground">
            {t("prompts.arena.intro")}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            {PROMPT_MODELS.map((model) => (
              <div key={model} className="flex items-center gap-2">
                <Checkbox
                  id={`arena-${model}`}
                  checked={selected.includes(model)}
                  onCheckedChange={() => toggleModel(model)}
                />
                <Label htmlFor={`arena-${model}`} className="font-mono text-xs">
                  {model}
                </Label>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="arena-judge"
                checked={judge}
                onCheckedChange={(next) => setJudge(Boolean(next))}
              />
              <Label htmlFor="arena-judge">{t("prompts.arena.judge")}</Label>
            </div>
            <Button
              onClick={start}
              disabled={isPending || running || selected.length === 0}
            >
              {isPending || running ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PlayIcon />
              )}
              {t("prompts.arena.run", { count: selected.length })}
            </Button>
          </div>

          {selected.length > 2 ? (
            <p className="text-xs text-muted-foreground">
              {t("prompts.arena.concurrency_hint")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {batches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GaugeIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">{t("prompts.arena.empty_title")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("prompts.arena.empty_body")}
            </p>
          </CardContent>
        </Card>
      ) : (
        batches.map((batch) => {
          const scoreFor = (runId: string) =>
            batch.judgement?.scores.find((score) => score.run_id === runId);
          return (
            <Card key={batch.batch_id}>
              <CardContent className="flex flex-col gap-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {t("prompts.arena.batch", { count: batch.runs.length })}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDateTime(batch.created_at)}
                  </span>
                </div>

                {batch.judgement ? (
                  <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <TrophyIcon className="size-4" />
                      {t("prompts.arena.verdict")}
                      <Badge variant="outline">{batch.judgement.model}</Badge>
                      {isArtefactActive(batch.judgement.status) ? (
                        <Badge variant="warning">
                          {t("prompts.arena.judging")}
                        </Badge>
                      ) : null}
                    </span>
                    {batch.judgement.status === "failed" ? (
                      <span className="text-sm text-destructive">
                        {batch.judgement.error}
                      </span>
                    ) : batch.judgement.summary ? (
                      <span className="text-sm text-muted-foreground">
                        {batch.judgement.summary}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {batch.runs.map((run) => {
                  const score = scoreFor(run.id);
                  const won = batch.judgement?.winner_run_id === run.id;
                  return (
                    <div key={run.id} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={won ? "success" : "outline"}>
                          {run.model}
                        </Badge>
                        {won ? (
                          <Badge variant="success">
                            <TrophyIcon className="size-3" />
                            {t("prompts.arena.winner")}
                          </Badge>
                        ) : null}
                        {isArtefactActive(run.status) ? (
                          <Badge variant="warning">
                            {t("prompts.arena.running")}
                          </Badge>
                        ) : run.status === "failed" ? (
                          <Badge variant="destructive">
                            {t("prompts.arena.failed")}
                          </Badge>
                        ) : null}
                        {score?.overall !== null &&
                        score?.overall !== undefined ? (
                          <Badge variant="secondary">
                            {t("prompts.arena.overall", {
                              score: score.overall,
                            })}
                          </Badge>
                        ) : null}
                      </div>

                      {run.status === "done" ? (
                        <div className="flex flex-wrap gap-x-8 gap-y-2">
                          <TokenStat
                            label={t("prompts.arena.tokens_in")}
                            value={formatNumber(run.input_tokens)}
                          />
                          <TokenStat
                            label={t("prompts.arena.tokens_out")}
                            value={formatNumber(run.output_tokens)}
                          />
                          <TokenStat
                            label={t("prompts.arena.cost")}
                            value={formatUsd(run.total_cost_usd)}
                          />
                          <TokenStat
                            label={t("prompts.arena.duration")}
                            value={`${Math.round(run.duration_seconds ?? 0)}s`}
                          />
                        </div>
                      ) : null}

                      {run.error ? (
                        <p className="text-sm text-destructive">{run.error}</p>
                      ) : null}

                      {score?.rationale ? (
                        <p className="text-sm text-muted-foreground">
                          {score.rationale}
                        </p>
                      ) : null}

                      {run.output ? (
                        <CollapsibleBlock
                          title={t("prompts.arena.output", {
                            model: run.model,
                          })}
                          content={run.output}
                          defaultOpen={false}
                          body="markdown"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
