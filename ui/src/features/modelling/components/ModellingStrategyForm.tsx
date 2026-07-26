import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useDeferredValue, useEffect } from "react";
import {
  type Control,
  type DefaultValues,
  useForm,
  useWatch,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  ComboboxField,
  FormFooter,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { MermaidDiagram } from "@/components/shared/MermaidDiagram";
import { Form } from "@/components/ui/form";
import { useTechnologyCorpusQuery } from "@/features/technologies";
import type { CreateModellingStrategy, ModellingStrategy } from "../api";
import {
  buildModellingStrategyFormSchema,
  COMPLEXITIES,
  FAMILIES_BY_TOPIC,
  type ModellingExample,
  type ModellingStrategyFormValues,
  TOPICS,
} from "../schemas";

/** `family` is intentionally absent so the Select starts on its placeholder. */
export const EMPTY_MODELLING_STRATEGY_FORM: DefaultValues<ModellingStrategyFormValues> =
  {
    name: "",
    slug: "",
    topic: "modelling",
    description: "",
    best_for: "",
    pros: "",
    cons: "",
    complexity: "medium",
    origin_year: "",
    originator: "",
    example_narrative: "",
    example_tables: "",
    example_snippets: "",
    example_decisions: "",
    diagram: "",
    related_technology_slugs: [],
  };

const splitLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

// Strict local shape — the generated ModellingExample marks defaulted fields optional.
interface ExampleTable {
  name: string;
  columns: string[];
  rows: string[][];
}

/**
 * Pipe syntax for example tables — blocks separated by blank lines:
 *   # table name
 *   col | col
 *   cell | cell
 * Cells must not contain "|" (stated in the field description). Short rows are
 * padded so the round-trip through the view table stays rectangular.
 */
function parseExampleTables(value: string): ExampleTable[] {
  return value
    .split(/\n\s*\n/)
    .map((block) => splitLines(block))
    .filter((lines) => lines.length >= 2 && lines[0].startsWith("#"))
    .map((lines) => {
      const columns = lines[1].split("|").map((cell) => cell.trim());
      return {
        name: lines[0].replace(/^#\s*/, "").trim() || "table",
        columns,
        rows: lines.slice(2).map((line) => {
          const cells = line.split("|").map((cell) => cell.trim());
          while (cells.length < columns.length) cells.push("");
          return cells.slice(0, columns.length);
        }),
      };
    });
}

interface ExampleSnippet {
  name: string;
  code: string;
}

/**
 * Snippet blocks start with a `~~~ name` line; everything until the next `~~~ `
 * (or the end) is the verbatim code — blank lines included, so any format
 * (JSON, YAML, .proto, ...) round-trips losslessly.
 */
function parseExampleSnippets(value: string): ExampleSnippet[] {
  const snippets: ExampleSnippet[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const line of value.split("\n")) {
    if (line.startsWith("~~~ ")) {
      if (current) {
        snippets.push({
          name: current.name,
          code: current.lines.join("\n").replace(/\s+$/, ""),
        });
      }
      current = { name: line.slice(4).trim() || "snippet", lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    snippets.push({
      name: current.name,
      code: current.lines.join("\n").replace(/\s+$/, ""),
    });
  }
  return snippets.filter((snippet) => snippet.code.length > 0);
}

function serializeExampleSnippets(
  snippets: NonNullable<ModellingExample["snippets"]>,
): string {
  return snippets
    .map((snippet) => `~~~ ${snippet.name}\n${snippet.code ?? ""}`)
    .join("\n\n");
}

function serializeExampleTables(
  tables: NonNullable<ModellingExample["tables"]>,
): string {
  return tables
    .map((table) =>
      [
        `# ${table.name}`,
        (table.columns ?? []).join(" | "),
        ...(table.rows ?? []).map((row) => row.join(" | ")),
      ].join("\n"),
    )
    .join("\n\n");
}

/**
 * Form shape → API shape: pros/cons/decisions one-per-line strings become
 * arrays, origin_year "" becomes null, and an all-empty example collapses to
 * null (so the view page's render-when-present checks stay trivial).
 * `position` is intentionally absent: PATCH must not reset seeded ordering,
 * and the New page adds the API-required `0`.
 */
export function modellingStrategyFormToPayload(
  values: ModellingStrategyFormValues,
): Omit<CreateModellingStrategy, "position"> {
  const narrative = values.example_narrative.trim();
  const tables = parseExampleTables(values.example_tables);
  const snippets = parseExampleSnippets(values.example_snippets);
  const decisions = splitLines(values.example_decisions);
  const exampleEmpty =
    !narrative &&
    tables.length === 0 &&
    snippets.length === 0 &&
    decisions.length === 0;
  const example: ModellingExample = { narrative, tables, snippets, decisions };
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    topic: values.topic,
    family: values.family,
    description: values.description,
    best_for: values.best_for,
    pros: splitLines(values.pros),
    cons: splitLines(values.cons),
    complexity: values.complexity,
    origin_year: values.origin_year === "" ? null : Number(values.origin_year),
    originator: values.originator.trim() || null,
    example: exampleEmpty ? null : example,
    // Diagrams are a modelling-topic concept; other topics store none.
    diagram: values.topic === "modelling" ? values.diagram : "",
    related_technology_slugs: values.related_technology_slugs,
  };
}

/** Server shape → form shape for edit hydration. */
export function modellingStrategyToFormValues(
  strategy: ModellingStrategy,
): ModellingStrategyFormValues {
  return {
    name: strategy.name,
    slug: strategy.slug,
    topic: strategy.topic,
    family: strategy.family,
    description: strategy.description,
    best_for: strategy.best_for,
    pros: strategy.pros.join("\n"),
    cons: strategy.cons.join("\n"),
    complexity: strategy.complexity,
    origin_year:
      strategy.origin_year === null ? "" : String(strategy.origin_year),
    originator: strategy.originator ?? "",
    example_narrative: strategy.example?.narrative ?? "",
    example_tables: serializeExampleTables(strategy.example?.tables ?? []),
    example_snippets: serializeExampleSnippets(
      strategy.example?.snippets ?? [],
    ),
    example_decisions: (strategy.example?.decisions ?? []).join("\n"),
    diagram: strategy.diagram,
    related_technology_slugs: strategy.related_technology_slugs,
  };
}

interface ModellingStrategyFormProps {
  defaultValues: DefaultValues<ModellingStrategyFormValues>;
  /** Server-backed values for Edit — RHF resets the form when they change. */
  values?: ModellingStrategyFormValues;
  onSubmit: (values: ModellingStrategyFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}

export function ModellingStrategyForm({
  defaultValues,
  values,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: ModellingStrategyFormProps) {
  const { t } = useTranslation();
  const { data: corpus } = useTechnologyCorpusQuery();

  const form = useForm<ModellingStrategyFormValues>({
    resolver: standardSchemaResolver(buildModellingStrategyFormSchema(t)),
    defaultValues,
    values,
  });
  const topic = useWatch({ control: form.control, name: "topic" });

  // Owns clearing a stale cross-topic family after the topic select changes —
  // SelectField exposes no change hook, and a stale family would pass the
  // 8-value enum yet fail the backend topic/family consistency check.
  useEffect(() => {
    const family = form.getValues("family");
    if (family && !FAMILIES_BY_TOPIC[topic]?.includes(family)) {
      form.resetField("family");
    }
  }, [topic, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-w-4xl flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField<ModellingStrategyFormValues>
            name="name"
            label={t("modelling.form.name_label")}
          />
          <TextField<ModellingStrategyFormValues>
            name="slug"
            label={t("modelling.form.slug_label")}
            description={t("modelling.form.slug_description")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<ModellingStrategyFormValues>
            name="topic"
            label={t("modelling.form.topic_label")}
            options={TOPICS.map((value) => ({
              value,
              label: t(`modelling.topic.${value}`),
            }))}
          />
          <SelectField<ModellingStrategyFormValues>
            name="family"
            label={t("modelling.form.family_label")}
            placeholder={t("modelling.form.family_placeholder")}
            options={(FAMILIES_BY_TOPIC[topic] ?? []).map((family) => ({
              value: family,
              label: t(`modelling.family.${family}`),
            }))}
          />
        </div>
        <TextareaField<ModellingStrategyFormValues>
          name="description"
          label={t("modelling.form.description_label")}
          rows={4}
        />
        <TextField<ModellingStrategyFormValues>
          name="best_for"
          label={t("modelling.form.best_for_label")}
          description={t("modelling.form.best_for_description")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextareaField<ModellingStrategyFormValues>
            name="pros"
            label={t("modelling.form.pros_label")}
            description={t("modelling.form.per_line_description")}
            rows={5}
          />
          <TextareaField<ModellingStrategyFormValues>
            name="cons"
            label={t("modelling.form.cons_label")}
            description={t("modelling.form.per_line_description")}
            rows={5}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField<ModellingStrategyFormValues>
            name="complexity"
            label={t("modelling.form.complexity_label")}
            options={COMPLEXITIES.map((complexity) => ({
              value: complexity,
              label: t(`modelling.complexity.${complexity}`),
            }))}
          />
          <TextField<ModellingStrategyFormValues>
            name="origin_year"
            label={t("modelling.form.origin_year_label")}
          />
          <TextField<ModellingStrategyFormValues>
            name="originator"
            label={t("modelling.form.originator_label")}
          />
        </div>
        <TextareaField<ModellingStrategyFormValues>
          name="example_narrative"
          label={t("modelling.form.example_narrative_label")}
          rows={2}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextareaField<ModellingStrategyFormValues>
            name="example_tables"
            label={t("modelling.form.example_tables_label")}
            description={t("modelling.form.example_tables_description")}
            rows={8}
          />
          <TextareaField<ModellingStrategyFormValues>
            name="example_decisions"
            label={t("modelling.form.example_decisions_label")}
            description={t("modelling.form.per_line_description")}
            rows={8}
          />
        </div>
        <TextareaField<ModellingStrategyFormValues>
          name="example_snippets"
          label={t("modelling.form.example_snippets_label")}
          description={t("modelling.form.example_snippets_description")}
          rows={8}
        />
        {topic === "modelling" && <DiagramEditor control={form.control} />}
        <ComboboxField<ModellingStrategyFormValues>
          name="related_technology_slugs"
          label={t("modelling.form.related_label")}
          placeholder={t("modelling.form.related_placeholder")}
          searchPlaceholder={t("modelling.form.related_search_placeholder")}
          emptyText={t("modelling.form.related_empty")}
          multiple
          options={(corpus ?? []).map((technology) => ({
            value: technology.slug,
            label: technology.name,
          }))}
        />
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

/** Mermaid textarea with a deferred live preview (BlueprintForm pattern). */
function DiagramEditor({
  control,
}: {
  control: Control<ModellingStrategyFormValues>;
}) {
  const { t } = useTranslation();
  const source = useWatch({ control, name: "diagram" });
  // Defer preview re-renders so typing in the textarea stays responsive.
  const deferredSource = useDeferredValue(source ?? "");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextareaField<ModellingStrategyFormValues>
        name="diagram"
        label={t("modelling.form.diagram_label")}
        description={t("modelling.form.diagram_description")}
        rows={10}
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t("modelling.form.diagram_preview")}
        </span>
        <div className="min-h-40 overflow-x-auto rounded-lg border border-dashed p-3">
          {deferredSource.trim() ? (
            <MermaidDiagram source={deferredSource} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("modelling.form.diagram_preview_empty")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
