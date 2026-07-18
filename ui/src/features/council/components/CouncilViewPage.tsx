import { useNavigate } from "@tanstack/react-router";
import { FlameIcon, PlayIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage } from "@/lib/api";
import { useCrumbOverride } from "@/lib/crumb";
import {
  isTopicActive,
  useConveneCouncilMutation,
  useCouncilTopicQuery,
} from "../api";
import { CouncilStatusBadge } from "./CouncilsListPage";
import { DebateProgress } from "./DebateProgress";
import { DebateTranscript } from "./DebateTranscript";
import { DeleteCouncilDialog } from "./DeleteCouncilDialog";
import { RosterEditor } from "./RosterEditor";
import { SynthesisCard } from "./SynthesisCard";

const LIST_SEARCH = { page: 1, size: 20 } as const;

/** One topic, orchestrated by status: roster editing pre-convene, live progress while the
 * rounds run, and the synthesis + transcript once the chair lands. */
export function CouncilViewPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: topic, isPending, isError, error } = useCouncilTopicQuery(id);
  const { mutate: convene, isPending: isConvening } =
    useConveneCouncilMutation(id);

  useCrumbOverride(topic?.name);

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError || !topic) {
    return (
      <Card className="p-6 text-sm text-destructive">
        {error ? extractErrorMessage(error) : t("common.states.error_body")}
      </Card>
    );
  }

  const editable =
    !isTopicActive(topic.status) || topic.status === "suggesting";
  const debating =
    topic.status === "r1_running" ||
    topic.status === "r2_running" ||
    topic.status === "synthesizing";
  const settled = topic.status === "completed" || topic.status === "failed";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CouncilStatusBadge status={topic.status} />
            {topic.devils_advocate ? (
              <Badge variant="destructive" className="gap-1">
                <FlameIcon className="size-3" />
                {t("council.view.da_badge")}
              </Badge>
            ) : null}
            {topic.repository_slugs.map((slug) => (
              <Badge key={slug} variant="outline">
                {slug}
              </Badge>
            ))}
          </div>
          <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
            {topic.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable ? (
            <Button
              size="sm"
              onClick={() => convene()}
              disabled={isConvening || topic.member_slugs.length === 0}
            >
              {settled ? (
                <RotateCcwIcon className="size-3.5" />
              ) : (
                <PlayIcon className="size-3.5" />
              )}
              {settled
                ? t("council.view.reconvene")
                : t("council.roster.convene")}
            </Button>
          ) : null}
          <DeleteCouncilDialog
            id={topic.id}
            name={topic.name}
            onDeleted={() => navigate({ to: "/council", search: LIST_SEARCH })}
            trigger={
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="size-3.5" />
                {t("council.delete.confirm")}
              </Button>
            }
          />
        </div>
      </div>

      {topic.status === "failed" && topic.error ? (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          {t("council.view.failed_banner", { error: topic.error })}
        </Card>
      ) : null}

      {editable && !settled ? <RosterEditor topic={topic} /> : null}
      {editable && topic.member_slugs.length === 0 && !settled ? (
        <p className="text-sm text-muted-foreground">
          {t("council.roster.convene_hint")}
        </p>
      ) : null}

      {debating ? <DebateProgress topic={topic} /> : null}

      {settled ? (
        <>
          <SynthesisCard topic={topic} />
          <DebateTranscript takes={topic.takes} />
          <RosterEditor topic={topic} />
        </>
      ) : null}
    </div>
  );
}
