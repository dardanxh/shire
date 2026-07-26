import { getRouteApi } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeSizing,
  type IngestMode,
  SIZING_DEFAULTS,
  type SizingInputs,
} from "../calc";
import {
  INGEST_MODES,
  INPUT_SECTIONS,
  NUMERIC_FIELD_KEYS,
  type SizingField,
  searchToInputs,
} from "../schemas";
import { ResultsPanel } from "./ResultsPanel";

const route = getRouteApi("/sizing");

export function CalculatorPage() {
  const { t } = useTranslation();
  const navigate = route.useNavigate();
  const search = route.useSearch();

  // URL search params are the durable, shareable source of truth. A local mirror keeps
  // typing instant; a debounced write reflects it back to the URL.
  const inputs = useMemo(() => searchToInputs(search), [search]);
  const [draft, setDraft] = useState<SizingInputs>(inputs);
  // Re-sync the draft when the URL changes from outside (deep link / loaded scenario).
  const lastSearchRef = useRef(inputs);
  if (
    lastSearchRef.current !== inputs &&
    !shallowEqual(lastSearchRef.current, inputs)
  ) {
    lastSearchRef.current = inputs;
    setDraft(inputs);
  }

  const results = useMemo(() => computeSizing(draft), [draft]);

  const urlTimer = useRef<number | undefined>(undefined);
  const setField = (key: keyof SizingInputs, value: number | string) => {
    const next = { ...draft, [key]: value } as SizingInputs;
    setDraft(next);
    window.clearTimeout(urlTimer.current);
    urlTimer.current = window.setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, [key]: value }),
        replace: true,
      });
    }, 250);
  };

  const reset = () => {
    window.clearTimeout(urlTimer.current);
    setDraft(SIZING_DEFAULTS);
    navigate({
      search: (prev) => ({ ...prev, ...SIZING_DEFAULTS }),
      replace: true,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold">
            {t("sizing.title")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("sizing.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcwIcon />
            {t("sizing.actions.reset")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Inputs */}
        <div className="flex flex-col gap-6">
          {INPUT_SECTIONS.map((section) => (
            <section
              key={section.key}
              className="flex flex-col gap-4 rounded-xl border bg-card p-4"
            >
              <h2 className="text-sm font-medium">
                {t(`sizing.section.${section.key}`)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.key === "volume" && (
                  <IngestModeField
                    value={draft.ingest_mode}
                    onChange={(value) => setField("ingest_mode", value)}
                  />
                )}
                {section.fields.map((field) => (
                  <NumberInput
                    key={field.key}
                    field={field}
                    value={draft[field.key] as number}
                    onChange={(value) => setField(field.key, value)}
                    label={t(`sizing.field.${field.key}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Results */}
        <ResultsPanel results={results} inputs={draft} />
      </div>
    </div>
  );
}

function IngestModeField({
  value,
  onChange,
}: {
  value: IngestMode;
  onChange: (value: IngestMode) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {t("sizing.ingest_mode_label")}
      </label>
      <Select
        items={INGEST_MODES.map((mode) => ({
          value: mode,
          label: t(`sizing.ingest_mode.${mode}`),
        }))}
        value={value}
        onValueChange={(next) => onChange((next as IngestMode) ?? "streaming")}
      >
        <SelectTrigger id={id} className="bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INGEST_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(`sizing.ingest_mode.${mode}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberInput({
  field,
  value,
  onChange,
  label,
}: {
  field: SizingField;
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={field.step}
        min={field.min}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(Number(event.target.value))}
        className="bg-background"
      />
    </div>
  );
}

function shallowEqual(a: SizingInputs, b: SizingInputs): boolean {
  if (a.ingest_mode !== b.ingest_mode) return false;
  return NUMERIC_FIELD_KEYS.every((key) => a[key] === b[key]);
}
