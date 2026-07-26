import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { type DefaultValues, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  FormFooter,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Form } from "@/components/ui/form";
import type { Archetype, CreateArchetype } from "../api";
import {
  type ArchetypeFormValues,
  buildArchetypeFormSchema,
  FAMILIES,
  SEED_TIERS,
} from "../schemas";

/** `family` is intentionally absent so the Select starts on its placeholder. */
export const EMPTY_ARCHETYPE_FORM: DefaultValues<ArchetypeFormValues> = {
  name: "",
  slug: "",
  summary: "",
  description: "",
  supports_greenfield: true,
  supports_brownfield: true,
  is_initiative: false,
  seed_tier: 2,
};

/**
 * Shared create/update payload. `position` is intentionally absent: PATCH must
 * not reset seeded ordering, and the New page adds the API-required `0`.
 */
export function archetypeFormToPayload(
  values: ArchetypeFormValues,
): Omit<CreateArchetype, "position"> {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    family: values.family,
    summary: values.summary,
    description: values.description,
    supports_greenfield: values.supports_greenfield,
    supports_brownfield: values.supports_brownfield,
    is_initiative: values.is_initiative,
    seed_tier: values.seed_tier,
  };
}

/** Server shape → form shape for edit hydration. */
export function archetypeToFormValues(
  archetype: Archetype,
): ArchetypeFormValues {
  return {
    name: archetype.name,
    slug: archetype.slug,
    family: archetype.family,
    summary: archetype.summary,
    description: archetype.description,
    supports_greenfield: archetype.supports_greenfield,
    supports_brownfield: archetype.supports_brownfield,
    is_initiative: archetype.is_initiative,
    seed_tier: (SEED_TIERS.find((tier) => tier === archetype.seed_tier) ??
      2) as ArchetypeFormValues["seed_tier"],
  };
}

interface ArchetypeFormProps {
  defaultValues: DefaultValues<ArchetypeFormValues>;
  /** Server-backed values for Edit — RHF resets the form when they change. */
  values?: ArchetypeFormValues;
  onSubmit: (values: ArchetypeFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}

export function ArchetypeForm({
  defaultValues,
  values,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: ArchetypeFormProps) {
  const { t } = useTranslation();

  const form = useForm<ArchetypeFormValues>({
    resolver: standardSchemaResolver(buildArchetypeFormSchema(t)),
    defaultValues,
    values,
  });

  const yesNoOptions = [
    { value: true, label: t("archetypes.form.yes") },
    { value: false, label: t("archetypes.form.no") },
  ];

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-w-2xl flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField<ArchetypeFormValues>
            name="name"
            label={t("archetypes.form.name_label")}
          />
          <TextField<ArchetypeFormValues>
            name="slug"
            label={t("archetypes.form.slug_label")}
            description={t("archetypes.form.slug_description")}
          />
        </div>
        <SelectField<ArchetypeFormValues>
          name="family"
          label={t("archetypes.form.family_label")}
          placeholder={t("archetypes.form.family_placeholder")}
          options={FAMILIES.map((family) => ({
            value: family,
            label: t(`archetypes.family.${family}`),
          }))}
        />
        <TextareaField<ArchetypeFormValues>
          name="summary"
          label={t("archetypes.form.summary_label")}
          description={t("archetypes.form.summary_description")}
          rows={2}
        />
        <TextareaField<ArchetypeFormValues>
          name="description"
          label={t("archetypes.form.description_label")}
          rows={5}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<ArchetypeFormValues>
            name="supports_greenfield"
            label={t("archetypes.form.greenfield_label")}
            options={yesNoOptions}
          />
          <SelectField<ArchetypeFormValues>
            name="supports_brownfield"
            label={t("archetypes.form.brownfield_label")}
            options={yesNoOptions}
          />
          <SelectField<ArchetypeFormValues>
            name="is_initiative"
            label={t("archetypes.form.initiative_label")}
            description={t("archetypes.form.initiative_description")}
            options={yesNoOptions}
          />
          <SelectField<ArchetypeFormValues>
            name="seed_tier"
            label={t("archetypes.form.seed_tier_label")}
            options={SEED_TIERS.map((tier) => ({
              value: tier,
              label: t("archetypes.tier_label", { tier }),
            }))}
          />
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
