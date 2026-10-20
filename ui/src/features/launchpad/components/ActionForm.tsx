import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Loader2Icon,
  PlayIcon,
  ServerOffIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  ComboboxField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useMcpServersQuery } from "@/features/mcp";
import { PROMPT_MODELS } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  type Bookmark,
  type BookmarkAction,
  NOTIFY_ON,
  useDeleteActionMutation,
  useRunActionMutation,
  useUpsertActionMutation,
} from "../api";
import {
  type ActionFormValues,
  CADENCE_PRESETS,
  CUSTOM_CADENCE,
  joinCadence,
  makeActionSchema,
  splitCadence,
} from "../schemas";

const DEFAULT_MODEL = "";

/**
 * The bookmark's one scheduled Claude action: what to check, which MCP servers
 * it may use, how often, and when to tell you. Saved as a whole (PUT upsert);
 * "Run now" queues a run for the host runner immediately.
 */
export function ActionForm({
  bookmark,
  action,
  onRunQueued,
}: {
  bookmark: Bookmark;
  action: BookmarkAction | null;
  onRunQueued: () => void;
}) {
  const { t } = useTranslation();
  const { data: mcp } = useMcpServersQuery();
  const { mutate: upsertAction, isPending: isSaving } = useUpsertActionMutation(
    bookmark.id,
  );
  const { mutate: deleteAction, isPending: isDeleting } =
    useDeleteActionMutation(bookmark.id);
  const { mutate: runAction, isPending: isQueueing } = useRunActionMutation(
    bookmark.id,
  );

  const form = useForm<ActionFormValues>({
    resolver: standardSchemaResolver(makeActionSchema(t)),
    defaultValues: {
      prompt: "",
      mcpServers: [],
      allowWrites: false,
      model: DEFAULT_MODEL,
      cadencePreset: "every:15m",
      customCadence: "",
      enabled: true,
      notifyOn: "new_items",
    },
    values: action
      ? {
          prompt: action.prompt,
          mcpServers: action.mcp_servers,
          allowWrites: action.allow_writes,
          model: action.model ?? DEFAULT_MODEL,
          ...splitCadence(action.cadence),
          enabled: action.enabled,
          notifyOn: action.notify_on as ActionFormValues["notifyOn"],
        }
      : undefined,
  });

  const cadencePreset = form.watch("cadencePreset");
  const allowWrites = form.watch("allowWrites");
  const selectedServers = form.watch("mcpServers");
  const knownServers = mcp?.servers ?? [];
  // Keep servers the action references even if the latest probe no longer lists them.
  const serverOptions = [
    ...knownServers.map((s) => ({
      value: s.name,
      label: `${s.name} — ${t(`mcp.status.${s.status}`, { defaultValue: s.status })}`,
    })),
    ...selectedServers
      .filter((name) => !knownServers.some((s) => s.name === name))
      .map((name) => ({
        value: name,
        label: `${name} — ${t("mcp.status.unknown")}`,
      })),
  ];
  const unhealthy = selectedServers.filter(
    (name) => knownServers.find((s) => s.name === name)?.status !== "connected",
  );

  const handleSubmit = (values: ActionFormValues) => {
    upsertAction(
      {
        prompt: values.prompt,
        mcp_servers: values.mcpServers,
        allow_writes: values.allowWrites,
        model: values.model || null,
        cadence: joinCadence(values),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        enabled: values.enabled,
        notify_on: values.notifyOn,
      },
      { onSuccess: () => toast.success(t("launchpad.action.toast_saved")) },
    );
  };

  const handleRun = () => {
    runAction(undefined, {
      onSuccess: () => {
        toast.success(t("launchpad.action.toast_queued"));
        onRunQueued();
      },
    });
  };

  return (
    <div className="space-y-4">
      {mcp && !mcp.host_runner_running ? (
        <Card className="flex-row items-start gap-3 border-amber-500/25 bg-amber-500/5 p-4 text-sm">
          <ServerOffIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-400">
              {t("mcp.card.runner_offline_title")}
            </p>
            <p className="text-amber-700/90 dark:text-amber-400/90">
              {t("launchpad.action.runner_offline")}
            </p>
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-5"
          >
            <TextareaField<ActionFormValues>
              name="prompt"
              label={t("launchpad.action.form.prompt.label")}
              description={t("launchpad.action.form.prompt.description")}
              placeholder={t("launchpad.action.form.prompt.placeholder")}
              rows={6}
              required
              disabled={isSaving}
            />

            <ComboboxField<ActionFormValues>
              name="mcpServers"
              multiple
              label={t("launchpad.action.form.servers.label")}
              description={
                knownServers.length === 0
                  ? t("launchpad.action.form.servers.none_probed")
                  : t("launchpad.action.form.servers.description")
              }
              options={serverOptions}
              placeholder={t("launchpad.action.form.servers.placeholder")}
              searchPlaceholder={t("launchpad.action.form.servers.search")}
              emptyText={t("launchpad.action.form.servers.empty")}
              disabled={isSaving}
            />
            {unhealthy.length > 0 && knownServers.length > 0 ? (
              <p className="-mt-3 text-xs text-amber-700 dark:text-amber-400">
                {t("launchpad.action.form.servers.unhealthy", {
                  names: unhealthy.join(", "),
                })}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField<ActionFormValues>
                name="cadencePreset"
                label={t("launchpad.action.form.cadence.label")}
                disabled={isSaving}
                options={[
                  ...CADENCE_PRESETS.map((preset) => ({
                    value: preset,
                    label: t(`launchpad.cadence.${preset}`),
                  })),
                  {
                    value: CUSTOM_CADENCE,
                    label: t("launchpad.cadence.custom"),
                  },
                ]}
              />
              {cadencePreset === CUSTOM_CADENCE ? (
                <TextField<ActionFormValues>
                  name="customCadence"
                  label={t("launchpad.action.form.custom_cadence.label")}
                  description={t(
                    "launchpad.action.form.custom_cadence.description",
                  )}
                  placeholder="cron:0 9-18 * * 1-5"
                  disabled={isSaving}
                />
              ) : (
                <SelectField<ActionFormValues>
                  name="notifyOn"
                  label={t("launchpad.action.form.notify.label")}
                  disabled={isSaving}
                  options={NOTIFY_ON.map((value) => ({
                    value,
                    label: t(`launchpad.notify_on.${value}`),
                  }))}
                />
              )}
              {cadencePreset === CUSTOM_CADENCE ? (
                <SelectField<ActionFormValues>
                  name="notifyOn"
                  label={t("launchpad.action.form.notify.label")}
                  disabled={isSaving}
                  options={NOTIFY_ON.map((value) => ({
                    value,
                    label: t(`launchpad.notify_on.${value}`),
                  }))}
                />
              ) : null}
              <SelectField<ActionFormValues>
                name="model"
                label={t("launchpad.action.form.model.label")}
                disabled={isSaving}
                options={[
                  {
                    value: DEFAULT_MODEL,
                    label: t("launchpad.action.form.model.default"),
                  },
                  ...PROMPT_MODELS.map((m) => ({ value: m, label: m })),
                ]}
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <SwitchField<ActionFormValues>
                name="enabled"
                label={t("launchpad.action.form.enabled.label")}
                disabled={isSaving}
              />
              <SwitchField<ActionFormValues>
                name="allowWrites"
                label={t("launchpad.action.form.writes.label")}
                disabled={isSaving}
              />
              {allowWrites ? (
                <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" />
                  {t("launchpad.action.form.writes.warning")}
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {action && action.denied_tools.length > 0
                    ? t("launchpad.action.form.writes.blocked", {
                        count: action.denied_tools.length,
                      })
                    : t("launchpad.action.form.writes.read_only")}
                </p>
              )}
            </div>

            {action ? (
              <p className="text-xs text-muted-foreground">
                {action.next_run_at
                  ? t("launchpad.action.next_run", {
                      at: formatDateTime(action.next_run_at),
                    })
                  : t("launchpad.action.no_schedule")}
                {action.last_run_at
                  ? ` · ${t("launchpad.action.last_run", {
                      at: formatDateTime(action.last_run_at),
                    })}`
                  : ""}
                {action.seen_count > 0
                  ? ` · ${t("launchpad.action.seen", { count: action.seen_count })}`
                  : ""}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2Icon className="animate-spin" /> : null}
                {action
                  ? t("common.actions.save")
                  : t("launchpad.action.create")}
              </Button>
              {action ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isQueueing || form.formState.isDirty}
                  onClick={handleRun}
                  title={
                    form.formState.isDirty
                      ? t("launchpad.action.save_first")
                      : undefined
                  }
                >
                  {isQueueing ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <PlayIcon />
                  )}
                  {t("launchpad.action.run_now")}
                </Button>
              ) : null}
              {action ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  disabled={isDeleting}
                  onClick={() =>
                    deleteAction(undefined, {
                      onSuccess: () => {
                        form.reset();
                        toast.success(t("launchpad.action.toast_deleted"));
                      },
                    })
                  }
                >
                  <Trash2Icon />
                  {t("launchpad.action.delete")}
                </Button>
              ) : null}
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
