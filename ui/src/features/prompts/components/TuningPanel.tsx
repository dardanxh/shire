import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  ChevronDownIcon,
  Loader2Icon,
  SlidersHorizontalIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  SelectField,
  SliderField,
  SwitchField,
  TagsField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { useRequestSuggestionMutation } from "../api";
import {
  ARCHETYPES,
  OUTPUT_FORMATS,
  type TuningFormValues,
  tuningFormSchema,
} from "../schemas";

/**
 * The knobs, and the button that turns them into a rewrite request.
 *
 * The knobs are not applied client-side — they are compiled into instructions for the model on the
 * backend (`prompts/jobs.py`), so what the user sets and what the engine is told can never drift.
 *
 * It collapses because it lives inside the editor: the prompt text is what you came to write, and
 * the knobs are worth a glance only when you are about to ask for a rewrite. The collapsed header
 * still carries the current settings, so the button never fires a rewrite you couldn't predict.
 */
export function TuningPanel({
  promptId,
  versionId,
  tuning,
  guidance,
  isBusy,
  isDirty,
}: {
  promptId: string;
  versionId: string;
  tuning: TuningFormValues;
  guidance: string;
  isBusy: boolean;
  /**
   * Whether the editor holds unsaved body edits. The rewrite runs server-side against
   * `versionId`'s stored body, so regenerating on a dirty draft would quietly rewrite the *last
   * saved* text — blocked rather than surprising.
   */
  isDirty: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate: requestSuggestion, isPending } = useRequestSuggestionMutation(
    promptId,
    versionId,
  );

  const form = useForm<TuningFormValues>({
    resolver: standardSchemaResolver(tuningFormSchema),
    defaultValues: tuning,
    // Re-seed when the caller's version changes; RHF resets on a new `values` reference.
    values: tuning,
  });

  // Watched per field rather than via a bare `watch()` so typing in the audience or disclaimer
  // box doesn't re-render the whole section on every keystroke.
  const archetype = form.watch("archetype");
  const criticality = form.watch("criticality");
  const verbosity = form.watch("verbosity");
  const disclaimer = form.watch("disclaimer");

  const handleSubmit = (values: TuningFormValues) => {
    requestSuggestion(
      { tuning: values, guidance: guidance || null },
      { onSuccess: () => toast.success(t("prompts.tuning.requested")) },
    );
  };

  const rating = (value: number) => t(`prompts.tuning.rating.${value}`);

  return (
    <Card className="p-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left">
          <SlidersHorizontalIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-sm font-semibold">
            {t("prompts.tuning.section_title")}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {t("prompts.tuning.summary", {
              archetype: t(`prompts.tuning.archetype_option.${archetype}`),
              criticality,
              verbosity,
            })}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
        </CollapsibleTrigger>

        <CollapsiblePanel className="border-t border-border px-4 py-4">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="flex flex-col gap-6"
            >
              <p className="text-sm text-muted-foreground">
                {t("prompts.tuning.intro")}
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                <SliderField<TuningFormValues>
                  name="criticality"
                  label={t("prompts.tuning.criticality")}
                  description={t("prompts.tuning.criticality_hint")}
                  formatValue={rating}
                />
                <SliderField<TuningFormValues>
                  name="sensitivity"
                  label={t("prompts.tuning.sensitivity")}
                  description={t("prompts.tuning.sensitivity_hint")}
                  formatValue={rating}
                />
                <SliderField<TuningFormValues>
                  name="verbosity"
                  label={t("prompts.tuning.verbosity")}
                  description={t("prompts.tuning.verbosity_hint")}
                  formatValue={rating}
                />
                {/* `options` rather than `<SelectItem>` children: only the data form lets the trigger
                    map the stored value back to its label, so children mode would display the raw
                    enum ("straight_to_point") instead of "Straight to the point". */}
                <SelectField<TuningFormValues>
                  name="archetype"
                  label={t("prompts.tuning.archetype")}
                  description={t("prompts.tuning.archetype_hint")}
                  options={ARCHETYPES.map((archetype) => ({
                    value: archetype,
                    label: t(`prompts.tuning.archetype_option.${archetype}`),
                  }))}
                />
                <SelectField<TuningFormValues>
                  name="output_format"
                  label={t("prompts.tuning.output_format")}
                  options={OUTPUT_FORMATS.map((format) => ({
                    value: format,
                    label: t(`prompts.tuning.output_format_option.${format}`),
                  }))}
                />
                <TextField<TuningFormValues>
                  name="audience"
                  label={t("prompts.tuning.audience")}
                  placeholder={t("prompts.tuning.audience_placeholder")}
                />
              </div>

              <TagsField<TuningFormValues>
                name="keywords"
                label={t("prompts.tuning.keywords")}
                description={t("prompts.tuning.keywords_hint")}
                placeholder={t("prompts.tuning.keywords_placeholder")}
              />

              <div className="flex flex-col gap-3">
                <SwitchField<TuningFormValues>
                  name="disclaimer"
                  label={t("prompts.tuning.disclaimer")}
                  info={t("prompts.tuning.disclaimer_hint")}
                />
                {disclaimer ? (
                  <TextareaField<TuningFormValues>
                    name="disclaimer_text"
                    label={t("prompts.tuning.disclaimer_text")}
                    placeholder={t(
                      "prompts.tuning.disclaimer_text_placeholder",
                    )}
                    rows={2}
                  />
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-xs text-muted-foreground">
                  {isDirty
                    ? t("prompts.tuning.dirty_blocked")
                    : t("prompts.tuning.footnote")}
                </p>
                <Button type="submit" disabled={isPending || isBusy || isDirty}>
                  {isPending || isBusy ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <WandSparklesIcon />
                  )}
                  {t("prompts.tuning.request")}
                </Button>
              </div>
            </form>
          </Form>
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  );
}
