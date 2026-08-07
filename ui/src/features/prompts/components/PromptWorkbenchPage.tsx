import {
  ChartLineIcon,
  GaugeIcon,
  HistoryIcon,
  ListChecksIcon,
  PencilIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractErrorMessage } from "@/lib/api";
import { useCrumbOverride } from "@/lib/crumb";
import {
  isArtefactActive,
  tuningToForm,
  useCreatePromptVersionMutation,
  usePromptAnalysisQuery,
  usePromptQuery,
} from "../api";
import type { PromptTab } from "../tabs";
import { useDebouncedValue } from "../use-debounced-value";
import { ArenaPanel } from "./ArenaPanel";
import { ChecksPanel } from "./ChecksPanel";
import { DashboardPanel } from "./DashboardPanel";
import { EditorPanel } from "./EditorPanel";
import { ScoreBadge } from "./ScoreBadge";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { TuningPanel } from "./TuningPanel";
import { VersionsPanel } from "./VersionsPanel";

/** Long enough that a normal typing burst is one request, short enough to feel live. */
const ANALYSIS_DEBOUNCE_MS = 400;

/**
 * The prompt workbench.
 *
 * The draft body lives here rather than in the editor so every tab scores the same text: the Checks
 * tab shows the verdict on what you are looking at, not on the last thing you saved. `undefined`
 * means "not edited yet" and falls through to the current version, which is what lets the panel
 * hydrate from the query without a mirroring effect.
 */
export function PromptWorkbenchPage({
  id,
  tab,
  onTabChange,
}: {
  id: string;
  tab: PromptTab;
  onTabChange: (tab: PromptTab) => void;
}) {
  const { t } = useTranslation();
  const { data: prompt, isPending, isError, error } = usePromptQuery(id);
  const { mutate: saveVersion, isPending: isSaving } =
    useCreatePromptVersionMutation(id);

  const [draftBody, setDraftBody] = useState<string>();
  const [draftGuidance, setDraftGuidance] = useState<string>();
  const [note, setNote] = useState("");

  useCrumbOverride(prompt?.name);

  const saved = prompt?.current_version;
  const body = draftBody ?? saved?.body ?? "";
  const guidance = draftGuidance ?? saved?.guidance ?? "";
  const isDirty = body.trim() !== "" && body !== (saved?.body ?? "");

  const debouncedBody = useDebouncedValue(body, ANALYSIS_DEBOUNCE_MS);
  const { data: analysis, isFetching: isAnalysing } =
    usePromptAnalysisQuery(debouncedBody);

  const suggestions = saved?.suggestions ?? [];
  const batches = saved?.batches ?? [];
  const arenaRunning = batches.some((batch) =>
    batch.runs.some((run) => isArtefactActive(run.status)),
  );
  const suggestionRunning = suggestions.some((s) => isArtefactActive(s.status));

  const handleSave = () => {
    saveVersion(
      {
        body,
        guidance: guidance || null,
        note: note || null,
        source: "manual",
      },
      {
        onSuccess: (version) => {
          toast.success(t("prompts.editor.saved", { number: version.number }));
          // Drop back to "not edited": the freshly saved version is now the baseline.
          setDraftBody(undefined);
          setDraftGuidance(undefined);
          setNote("");
        },
      },
    );
  };

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {t("prompts.load_error", { message: extractErrorMessage(error) })}
        </CardContent>
      </Card>
    );
  }

  if (isPending || !prompt) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{prompt.name}</h1>
          {prompt.description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {prompt.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {prompt.current_version_number !== null ? (
            <Badge variant="outline">
              {t("prompts.versions.number", {
                number: prompt.current_version_number,
              })}
            </Badge>
          ) : null}
          <ScoreBadge
            score={prompt.static_score}
            label={t("prompts.saved_score")}
          />
          {isDirty ? (
            <Badge variant="warning">{t("prompts.unsaved")}</Badge>
          ) : null}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => onTabChange(next as PromptTab)}
      >
        <TabsList>
          <TabsTrigger value="editor">
            <PencilIcon />
            {t("prompts.tabs.editor")}
          </TabsTrigger>
          <TabsTrigger value="checks">
            <ListChecksIcon />
            {t("prompts.tabs.checks")}
            {analysis && analysis.findings.length > 0 ? (
              <Badge variant="ghost">{analysis.findings.length}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="arena">
            <GaugeIcon />
            {t("prompts.tabs.arena")}
            {arenaRunning ? (
              <Badge variant="warning">{t("prompts.tabs.running")}</Badge>
            ) : batches.length > 0 ? (
              <Badge variant="ghost">{batches.length}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <ChartLineIcon />
            {t("prompts.tabs.dashboard")}
          </TabsTrigger>
          <TabsTrigger value="versions">
            <HistoryIcon />
            {t("prompts.tabs.versions")}
            <Badge variant="ghost">{prompt.version_count}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor">
          <EditorPanel
            body={body}
            guidance={guidance}
            note={note}
            onBodyChange={setDraftBody}
            onGuidanceChange={setDraftGuidance}
            onNoteChange={setNote}
            analysis={analysis}
            isAnalysing={isAnalysing}
            isDirty={isDirty}
            isSaving={isSaving}
            onSave={handleSave}
            tuning={
              saved ? (
                <TuningPanel
                  promptId={id}
                  versionId={saved.id}
                  tuning={tuningToForm(saved.tuning)}
                  guidance={guidance}
                  isBusy={suggestionRunning}
                  isDirty={isDirty}
                />
              ) : null
            }
            suggestions={
              saved ? (
                <SuggestionsPanel
                  // Remount on a new proposal: hunk ids are positional, so carrying the previous
                  // accept/reject set over would silently reject unrelated changes.
                  key={suggestions[0]?.id ?? "none"}
                  promptId={id}
                  currentBody={saved.body}
                  suggestions={suggestions}
                  onMerged={() => {
                    // The merge created a new current version; drop the local draft so the editor
                    // shows the merged text rather than the pre-merge draft.
                    setDraftBody(undefined);
                    setNote("");
                  }}
                />
              ) : null
            }
          />
        </TabsContent>

        <TabsContent value="checks">
          <ChecksPanel
            analysis={analysis}
            isPending={isAnalysing}
            promptId={id}
            versionId={saved?.id}
            reviews={saved?.reviews ?? []}
          />
        </TabsContent>

        <TabsContent value="arena">
          {saved ? (
            <ArenaPanel promptId={id} versionId={saved.id} batches={batches} />
          ) : null}
        </TabsContent>

        <TabsContent value="dashboard">
          <DashboardPanel promptId={id} />
        </TabsContent>

        <TabsContent value="versions">
          <VersionsPanel
            promptId={id}
            versions={prompt.versions}
            currentVersionId={prompt.current_version_id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
