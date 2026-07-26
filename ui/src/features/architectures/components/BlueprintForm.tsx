import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  type Control,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  ComboboxField,
  FormFooter,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { MermaidDiagram } from "@/components/shared/MermaidDiagram";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useTechnologyCorpusQuery } from "@/features/technologies";
import type { Blueprint, CreateBlueprint, UpdateBlueprint } from "../api";
import { FAMILIES } from "../families";
import {
  type BlueprintFormValues,
  buildBlueprintFormSchema,
  EMPTY_STAGE,
} from "../schemas";
import { USE_CASE_SLUGS } from "../use-cases";
import { DiagramTabs } from "./DiagramTabs";

export const EMPTY_BLUEPRINT_FORM: BlueprintFormValues = {
  name: "",
  slug: "",
  use_case: "",
  description: "",
  when_to_use: "",
  when_not_to_use: "",
  use_cases: [],
  hot_spots: "",
  diagram_conceptual: "",
  diagram_logical: "",
  diagram_data_flow: "",
  diagram_sequence: "",
  diagram_stack_aws: "",
  diagram_stack_azure: "",
  diagram_stack_gcp: "",
  diagram_stack_open_source: "",
  diagram_stack_snowflake: "",
  diagram_stack_databricks: "",
  family_tags: [],
  stages: [],
};

/** Diagram kinds editable in the form, in presentation order. */
const DIAGRAM_FIELDS = [
  ["conceptual", "diagram_conceptual"],
  ["logical", "diagram_logical"],
  ["data_flow", "diagram_data_flow"],
  ["sequence", "diagram_sequence"],
  ["stack_aws", "diagram_stack_aws"],
  ["stack_azure", "diagram_stack_azure"],
  ["stack_gcp", "diagram_stack_gcp"],
  ["stack_open_source", "diagram_stack_open_source"],
  ["stack_snowflake", "diagram_stack_snowflake"],
  ["stack_databricks", "diagram_stack_databricks"],
] as const;

/** Non-empty diagram fields → the API's `diagrams` array (order preserved). */
function diagramsToPayload(
  values: BlueprintFormValues,
): NonNullable<CreateBlueprint["diagrams"]> {
  return DIAGRAM_FIELDS.filter(([, field]) => values[field].trim() !== "").map(
    ([kind, field]) => ({ kind, mermaid: values[field] }),
  );
}

/** One-item-per-line textarea ↔ string-list mapping for guidance bullets. */
const fromLines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Hot spots edit as "Title: detail" lines; split on the first ": ". */
function hotSpotsFromLines(
  text: string,
): NonNullable<CreateBlueprint["hot_spots"]> {
  return fromLines(text).map((line) => {
    const split = line.indexOf(": ");
    return split === -1
      ? { title: line, detail: "" }
      : { title: line.slice(0, split), detail: line.slice(split + 2) };
  });
}

function hotSpotsToLines(spots: Blueprint["hot_spots"]): string {
  return spots
    .map((spot) => (spot.detail ? `${spot.title}: ${spot.detail}` : spot.title))
    .join("\n");
}

/** Stage rows shared by both payload shapes (positions come from array order). */
function stagesToPayload(
  stages: BlueprintFormValues["stages"],
): NonNullable<CreateBlueprint["stages"]> {
  return stages.map((stage) => ({
    name: stage.name.trim(),
    role: stage.role,
    recommended_technology_id: stage.recommended_technology_id || null,
    alternative_technology_ids: stage.alternative_technology_ids,
    rationale: stage.rationale,
    // Canvas-only fields aren't edited by this structured form; send defaults.
    custom_color: "",
    environment: "",
    owner_name: "",
    owner_email: "",
  }));
}

export function blueprintFormToCreatePayload(
  values: BlueprintFormValues,
): CreateBlueprint {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    use_case: values.use_case,
    description: values.description,
    when_to_use: fromLines(values.when_to_use),
    when_not_to_use: fromLines(values.when_not_to_use),
    use_cases: values.use_cases,
    hot_spots: hotSpotsFromLines(values.hot_spots),
    // Not edited by the form; defaults for new architectures.
    complexity: "medium",
    evolution: [],
    diagrams: diagramsToPayload(values),
    family_tags: values.family_tags,
    position: 0,
    stages: stagesToPayload(values.stages),
  };
}

/** PATCH payload — slug is create-only, `stages` replaces the list wholesale. */
export function blueprintFormToUpdatePayload(
  values: BlueprintFormValues,
): UpdateBlueprint {
  return {
    name: values.name.trim(),
    use_case: values.use_case,
    description: values.description,
    when_to_use: fromLines(values.when_to_use),
    when_not_to_use: fromLines(values.when_not_to_use),
    use_cases: values.use_cases,
    hot_spots: hotSpotsFromLines(values.hot_spots),
    diagrams: diagramsToPayload(values),
    family_tags: values.family_tags,
    stages: stagesToPayload(values.stages),
  };
}

function diagramOf(blueprint: Blueprint, kind: string): string {
  return blueprint.diagrams.find((d) => d.kind === kind)?.mermaid ?? "";
}

/** Server shape → form shape for edit hydration. */
export function blueprintToFormValues(
  blueprint: Blueprint,
): BlueprintFormValues {
  return {
    name: blueprint.name,
    slug: blueprint.slug,
    use_case: blueprint.use_case,
    description: blueprint.description,
    when_to_use: blueprint.when_to_use.join("\n"),
    when_not_to_use: blueprint.when_not_to_use.join("\n"),
    use_cases: blueprint.use_cases,
    hot_spots: hotSpotsToLines(blueprint.hot_spots),
    diagram_conceptual: diagramOf(blueprint, "conceptual"),
    diagram_logical: diagramOf(blueprint, "logical"),
    diagram_data_flow: diagramOf(blueprint, "data_flow"),
    diagram_sequence: diagramOf(blueprint, "sequence"),
    diagram_stack_aws: diagramOf(blueprint, "stack_aws"),
    diagram_stack_azure: diagramOf(blueprint, "stack_azure"),
    diagram_stack_gcp: diagramOf(blueprint, "stack_gcp"),
    diagram_stack_open_source: diagramOf(blueprint, "stack_open_source"),
    diagram_stack_snowflake: diagramOf(blueprint, "stack_snowflake"),
    diagram_stack_databricks: diagramOf(blueprint, "stack_databricks"),
    family_tags: blueprint.family_tags,
    stages: blueprint.stages.map((stage) => ({
      name: stage.name,
      role: stage.role,
      recommended_technology_id: stage.recommended_technology_id ?? "",
      alternative_technology_ids: stage.alternative_technology_ids,
      rationale: stage.rationale,
    })),
  };
}

/** Kind-tabbed Mermaid editor with a deferred live preview per diagram view. */
function DiagramEditor({ control }: { control: Control<BlueprintFormValues> }) {
  const { t } = useTranslation();
  const [kind, setKind] =
    useState<(typeof DIAGRAM_FIELDS)[number][0]>("conceptual");
  const field =
    DIAGRAM_FIELDS.find(([k]) => k === kind)?.[1] ?? "diagram_conceptual";
  const source = useWatch({ control, name: field });
  // Defer preview re-renders so typing in the textarea stays responsive.
  const deferredSource = useDeferredValue(source);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {t("blueprints.form.diagram_label")}
        </span>
        <DiagramTabs
          kinds={DIAGRAM_FIELDS.map(([k]) => k)}
          active={kind}
          onChange={(next) => setKind(next as typeof kind)}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TextareaField<BlueprintFormValues>
          key={field}
          name={field}
          label={t(`blueprints.diagram.kind_${kind}`)}
          description={t("blueprints.form.diagram_description")}
          rows={12}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            {t("blueprints.form.diagram_preview")}
          </span>
          <div className="min-h-40 overflow-x-auto rounded-lg border border-dashed p-3">
            {deferredSource.trim() ? (
              <MermaidDiagram key={field} source={deferredSource} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("blueprints.form.diagram_preview_empty")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageRow({
  index,
  controls,
  technologyOptions,
}: {
  index: number;
  controls: React.ReactNode;
  technologyOptions: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  const recommendedOptions = [
    { value: "", label: t("blueprints.form.stage_recommended_none") },
    ...technologyOptions,
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("blueprints.form.stage_label", { position: index + 1 })}
        </span>
        {controls}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField<BlueprintFormValues>
          name={`stages.${index}.name`}
          label={t("blueprints.form.stage_name_label")}
        />
        <TextField<BlueprintFormValues>
          name={`stages.${index}.role`}
          label={t("blueprints.form.stage_role_label")}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ComboboxField<BlueprintFormValues>
          name={`stages.${index}.recommended_technology_id`}
          label={t("blueprints.form.stage_recommended_label")}
          options={recommendedOptions}
          placeholder={t("blueprints.form.stage_recommended_placeholder")}
          searchPlaceholder={t("blueprints.form.technology_search_placeholder")}
          emptyText={t("blueprints.form.technology_empty")}
        />
        <ComboboxField<BlueprintFormValues>
          name={`stages.${index}.alternative_technology_ids`}
          multiple
          label={t("blueprints.form.stage_alternatives_label")}
          options={technologyOptions}
          placeholder={t("blueprints.form.stage_alternatives_placeholder")}
          searchPlaceholder={t("blueprints.form.technology_search_placeholder")}
          emptyText={t("blueprints.form.technology_empty")}
        />
      </div>
      <TextareaField<BlueprintFormValues>
        name={`stages.${index}.rationale`}
        label={t("blueprints.form.stage_rationale_label")}
        rows={2}
      />
    </div>
  );
}

interface BlueprintFormProps {
  defaultValues: BlueprintFormValues;
  /** Server-backed values for Edit — RHF resets the form when they change. */
  values?: BlueprintFormValues;
  /** The slug is create-only; Edit hides the field entirely. */
  includeSlug: boolean;
  onSubmit: (values: BlueprintFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}

export function BlueprintForm({
  defaultValues,
  values,
  includeSlug,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: BlueprintFormProps) {
  const { t } = useTranslation();
  const { data: corpus } = useTechnologyCorpusQuery();

  const technologyOptions = (corpus ?? []).map((tech) => ({
    value: tech.id,
    label: tech.name,
  }));
  const familyOptions = FAMILIES.map((family) => ({
    value: family as string,
    label: t(`blueprints.family.${family}`),
  }));
  const useCaseOptions = USE_CASE_SLUGS.map((slug) => ({
    value: slug as string,
    label: t(`blueprints.use_case_tags.${slug}`),
  }));

  const form = useForm<BlueprintFormValues>({
    resolver: standardSchemaResolver(
      buildBlueprintFormSchema(t, { requireSlug: includeSlug }),
    ),
    defaultValues,
    values,
  });
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "stages",
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-w-4xl flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField<BlueprintFormValues>
            name="name"
            label={t("blueprints.form.name_label")}
          />
          {includeSlug && (
            <TextField<BlueprintFormValues>
              name="slug"
              label={t("blueprints.form.slug_label")}
              description={t("blueprints.form.slug_description")}
            />
          )}
        </div>
        <TextField<BlueprintFormValues>
          name="use_case"
          label={t("blueprints.form.use_case_label")}
          description={t("blueprints.form.use_case_description")}
        />
        <TextareaField<BlueprintFormValues>
          name="description"
          label={t("blueprints.form.description_label")}
          rows={4}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextareaField<BlueprintFormValues>
            name="when_to_use"
            label={t("blueprints.form.when_to_use_label")}
            description={t("blueprints.form.one_per_line")}
            rows={4}
          />
          <TextareaField<BlueprintFormValues>
            name="when_not_to_use"
            label={t("blueprints.form.when_not_to_use_label")}
            description={t("blueprints.form.one_per_line")}
            rows={4}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ComboboxField<BlueprintFormValues>
            name="use_cases"
            multiple
            label={t("blueprints.form.use_cases_label")}
            options={useCaseOptions}
            placeholder={t("blueprints.form.use_cases_placeholder")}
            searchPlaceholder={t("blueprints.form.use_cases_placeholder")}
            emptyText={t("blueprints.form.family_tags_empty")}
          />
          <TextareaField<BlueprintFormValues>
            name="hot_spots"
            label={t("blueprints.form.hot_spots_label")}
            description={t("blueprints.form.hot_spots_description")}
            rows={4}
          />
        </div>

        <DiagramEditor control={form.control} />

        <div className="grid gap-4 sm:grid-cols-2">
          <ComboboxField<BlueprintFormValues>
            name="family_tags"
            multiple
            label={t("blueprints.form.family_tags_label")}
            options={familyOptions}
            placeholder={t("blueprints.form.family_tags_placeholder")}
            searchPlaceholder={t(
              "blueprints.form.family_tags_search_placeholder",
            )}
            emptyText={t("blueprints.form.family_tags_empty")}
          />
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">
            {t("blueprints.form.stages_label")}
          </span>
          {fields.map((field, index) => (
            <StageRow
              key={field.id}
              index={index}
              technologyOptions={technologyOptions}
              controls={
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    aria-label={t("blueprints.form.move_up")}
                    onClick={() => move(index, index - 1)}
                  >
                    <ChevronUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === fields.length - 1}
                    aria-label={t("blueprints.form.move_down")}
                    onClick={() => move(index, index + 1)}
                  >
                    <ChevronDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    aria-label={t("blueprints.form.remove_stage")}
                    onClick={() => remove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              }
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => append({ ...EMPTY_STAGE })}
          >
            <PlusIcon />
            {t("blueprints.form.add_stage")}
          </Button>
        </div>

        <FormFooter
          submitLabel={submitLabel}
          cancelLabel={t("common.actions.cancel")}
          onCancel={onCancel}
          isPending={isPending}
        />
      </form>
    </Form>
  );
}
