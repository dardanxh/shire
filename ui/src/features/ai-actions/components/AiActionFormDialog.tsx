import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { ShieldCheckIcon, TerminalIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { PROMPT_MODELS } from "@/lib/api";
import {
  type AiAction,
  type AiActionIn,
  useCreateAiActionMutation,
  useUpdateAiActionMutation,
} from "../api";
import {
  type AiActionFormValues,
  CUSTOM_SCHEDULE,
  DEFAULT_MODEL,
  joinSchedule,
  makeAiActionSchema,
  SCHEDULE_PRESETS,
  splitSchedule,
  TIMEOUT_MINUTES,
} from "../schemas";

const NEW_ACTION_DEFAULTS: AiActionFormValues = {
  title: "",
  prompt: "",
  model: DEFAULT_MODEL,
  schedulePreset: "manual",
  customSchedule: "",
  enabled: true,
  allowShell: false,
  timeoutMinutes: "15",
};

function toFormValues(action: AiAction): AiActionFormValues {
  return {
    title: action.title,
    prompt: action.prompt,
    model: action.model ?? DEFAULT_MODEL,
    ...splitSchedule(action.schedule),
    enabled: action.enabled,
    allowShell: action.allow_shell,
    timeoutMinutes: String(Math.round(action.timeout_seconds / 60)),
  };
}

function toBody(values: AiActionFormValues): AiActionIn {
  return {
    title: values.title.trim(),
    prompt: values.prompt.trim(),
    model: values.model || null,
    schedule: joinSchedule(values),
    // Schedules are evaluated in the browser's zone: "daily" means 09:00 where you are.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    enabled: values.enabled,
    allow_shell: values.allowShell,
    timeout_seconds: Number(values.timeoutMinutes) * 60,
  };
}

/** Create an action, or edit one (`action` supplied). Saved as a whole. */
export function AiActionFormDialog({
  action,
  open,
  onOpenChange,
  onSaved,
}: {
  action?: AiAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (saved: AiAction) => void;
}) {
  const { t } = useTranslation();
  const { mutate: createAction, isPending: isCreating } =
    useCreateAiActionMutation();
  const { mutate: updateAction, isPending: isUpdating } =
    useUpdateAiActionMutation(action?.id ?? "");
  const isPending = isCreating || isUpdating;

  const form = useForm<AiActionFormValues>({
    resolver: standardSchemaResolver(makeAiActionSchema(t)),
    defaultValues: NEW_ACTION_DEFAULTS,
    values: action ? toFormValues(action) : undefined,
  });
  const schedulePreset = form.watch("schedulePreset");
  const allowShell = form.watch("allowShell");
  const timeoutMinutes = form.watch("timeoutMinutes");
  // An API-set limit outside the presets stays selectable rather than silently changing.
  const timeoutOptions = (TIMEOUT_MINUTES as readonly string[]).includes(
    timeoutMinutes,
  )
    ? TIMEOUT_MINUTES
    : [...TIMEOUT_MINUTES, timeoutMinutes];

  const handleSubmit = (values: AiActionFormValues) => {
    const onSuccess = (saved: AiAction) => {
      toast.success(
        t(action ? "ai_actions.toast.saved" : "ai_actions.toast.created", {
          title: saved.title,
        }),
      );
      if (!action) form.reset(NEW_ACTION_DEFAULTS);
      onOpenChange(false);
      onSaved?.(saved);
    };
    if (action) updateAction(toBody(values), { onSuccess });
    else createAction(toBody(values), { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-5"
          >
            <DialogHeader>
              <DialogTitle>
                {action
                  ? t("ai_actions.dialog.edit_title")
                  : t("ai_actions.dialog.new_title")}
              </DialogTitle>
              <DialogDescription>
                {t("ai_actions.dialog.description")}
              </DialogDescription>
            </DialogHeader>

            <TextField<AiActionFormValues>
              name="title"
              label={t("ai_actions.form.title.label")}
              placeholder={t("ai_actions.form.title.placeholder")}
              required
              autoFocus
              disabled={isPending}
            />

            <TextareaField<AiActionFormValues>
              name="prompt"
              label={t("ai_actions.form.prompt.label")}
              description={t("ai_actions.form.prompt.description")}
              placeholder={t("ai_actions.form.prompt.placeholder")}
              rows={8}
              className="font-mono text-sm"
              required
              disabled={isPending}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField<AiActionFormValues>
                name="model"
                label={t("ai_actions.form.model.label")}
                disabled={isPending}
                options={[
                  {
                    value: DEFAULT_MODEL,
                    label: t("ai_actions.form.model.default"),
                  },
                  ...PROMPT_MODELS.map((m) => ({ value: m, label: m })),
                ]}
              />
              <SelectField<AiActionFormValues>
                name="timeoutMinutes"
                label={t("ai_actions.form.timeout.label")}
                disabled={isPending}
                options={timeoutOptions.map((m) => ({
                  value: m,
                  label: t("ai_actions.form.timeout.minutes", {
                    count: Number(m),
                  }),
                }))}
              />
              <SelectField<AiActionFormValues>
                name="schedulePreset"
                label={t("ai_actions.form.schedule.label")}
                disabled={isPending}
                options={[
                  ...SCHEDULE_PRESETS.map((preset) => ({
                    value: preset,
                    label: t(`ai_actions.schedule.${preset}`),
                  })),
                  {
                    value: CUSTOM_SCHEDULE,
                    label: t("ai_actions.schedule.custom"),
                  },
                ]}
              />
              {schedulePreset === CUSTOM_SCHEDULE ? (
                <TextField<AiActionFormValues>
                  name="customSchedule"
                  label={t("ai_actions.form.custom_schedule.label")}
                  description={t("ai_actions.form.custom_schedule.description")}
                  placeholder="cron:30 8 * * 1-5"
                  disabled={isPending}
                />
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <SwitchField<AiActionFormValues>
                name="enabled"
                label={t("ai_actions.form.enabled.label")}
                disabled={isPending || schedulePreset === "manual"}
              />
              <SwitchField<AiActionFormValues>
                name="allowShell"
                label={t("ai_actions.form.shell.label")}
                disabled={isPending}
              />
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                {allowShell ? (
                  <TerminalIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                ) : (
                  <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                )}
                {allowShell
                  ? t("ai_actions.form.shell.on")
                  : t("ai_actions.form.shell.off")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("ai_actions.form.read_only_note")}
              </p>
            </div>

            <FormFooter
              submitLabel={
                action
                  ? t("common.actions.save")
                  : t("ai_actions.dialog.create")
              }
              cancelLabel={t("common.actions.cancel")}
              onCancel={() => onOpenChange(false)}
              isPending={isPending}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
