import { useNavigate } from "@tanstack/react-router";
import {
  Loader2Icon,
  MapIcon,
  MessageCircleQuestionIcon,
  PlusIcon,
  RadarIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { HomeStatusOut } from "@/lib/api";
import { useRunDriftEverywhereMutation } from "../api";

/** One-click entries into the most common flows. */
export function QuickActionsCard({ status }: { status: HomeStatusOut }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: runDrift, isPending: isDrifting } =
    useRunDriftEverywhereMutation();
  const firstRepoId = status.checklist.first_repository_id;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          navigate({
            to: "/repositories",
            search: { view: "repositories", page: 1, size: 20, wizard: true },
          })
        }
      >
        <PlusIcon className="size-3.5" />
        {t("home.actions.import_repo")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate({ to: "/roadmaps/new" })}
      >
        <MapIcon className="size-3.5" />
        {t("home.actions.new_roadmap")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!firstRepoId}
        title={firstRepoId ? undefined : t("home.checklist.needs_repo_hint")}
        onClick={() =>
          firstRepoId &&
          navigate({
            to: "/repositories/$id",
            params: { id: firstRepoId },
            search: { tab: "ask", tool: undefined },
          })
        }
      >
        <MessageCircleQuestionIcon className="size-3.5" />
        {t("home.actions.ask")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isDrifting}
        onClick={() =>
          runDrift(undefined, {
            onSuccess: ({ started, skipped }) =>
              toast.success(t("home.actions.drift_done", { started, skipped })),
          })
        }
      >
        {isDrifting ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RadarIcon className="size-3.5" />
        )}
        {t("home.actions.run_drift")}
      </Button>
    </div>
  );
}
