import { useNavigate } from "@tanstack/react-router";
import { BotIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  CardColumnsSelect,
  useCardColumns,
} from "@/components/shared/CardColumns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { extractErrorMessage } from "@/lib/api";
import { isInFlight, useAiActionsQuery } from "../api";
import { AiActionCard } from "./AiActionCard";
import { AiActionFormDialog } from "./AiActionFormDialog";
import { RunAllAiActionsDialog } from "./RunAllAiActionsDialog";
import { RunnerBanner } from "./RunnerBanner";

/** Every AI action as a card: run it, see when it runs next, open its latest report. */
export function AiActionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: actions, isPending, isError, error } = useAiActionsQuery();
  const [gridClass, columns, setColumns] = useCardColumns();
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("ai_actions.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("ai_actions.desc")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CardColumnsSelect
            columns={columns}
            onChange={setColumns}
            label={t("common.cards.per_row")}
            autoLabel={t("common.cards.auto")}
          />
          <Button
            variant="outline"
            disabled={!actions?.length || actions.every(isInFlight)}
            onClick={() => setRefreshing(true)}
          >
            <RefreshCwIcon />
            {t("ai_actions.run_all.button")}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            {t("ai_actions.new")}
          </Button>
        </div>
      </div>

      <RunnerBanner />

      {isPending ? (
        <div className={gridClass}>
          {["a", "b", "c", "d"].map((k) => (
            <Skeleton key={k} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive">
          {t("ai_actions.load_error", { message: extractErrorMessage(error) })}
        </p>
      ) : null}

      {actions && actions.length === 0 ? (
        <Card className="items-center gap-3 p-10 text-center">
          <BotIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{t("ai_actions.empty.title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("ai_actions.empty.body")}
          </p>
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            {t("ai_actions.new")}
          </Button>
        </Card>
      ) : null}

      {actions && actions.length > 0 ? (
        <div className={gridClass}>
          {actions.map((action) => (
            <AiActionCard key={action.id} action={action} />
          ))}
        </div>
      ) : null}

      <RunAllAiActionsDialog
        actions={actions ?? []}
        open={refreshing}
        onOpenChange={setRefreshing}
      />
      <AiActionFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(saved) =>
          navigate({ to: "/ai-actions/$id", params: { id: saved.id } })
        }
      />
    </div>
  );
}
