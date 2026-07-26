import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  ComboboxField,
  FormFooter,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Form } from "@/components/ui/form";
import {
  type CreateTechnology,
  type Technology,
  useTechnologyCategoriesQuery,
} from "../api";
import { flattenCategories } from "../category-utils";
import {
  buildTechnologyFormSchema,
  DEPLOYMENT_MODELS,
  MATURITIES,
  type TechnologyFormValues,
} from "../schemas";
import { AuthMethodsField } from "./AuthMethodsField";

export const EMPTY_TECHNOLOGY_FORM: TechnologyFormValues = {
  name: "",
  slug: "",
  category_id: "",
  description: "",
  homepage_url: "",
  maturity: "established",
  oss: false,
  deployment_models: [],
  aliases: "",
  tags: "",
  auth_methods: [],
};

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Normalize form values to the API payload (called from the page submit
 * handlers): comma-separated `aliases`/`tags` → `string[]`, empty
 * `homepage_url` → `null`. See the divergence note in schemas.ts.
 */
export function technologyFormToPayload(
  values: TechnologyFormValues,
): CreateTechnology {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    category_id: values.category_id,
    description: values.description,
    homepage_url: values.homepage_url === "" ? null : values.homepage_url,
    maturity: values.maturity,
    oss: values.oss,
    // Adoption profile is corpus-curated, not form-edited — send defaults.
    learning_curve: "moderate" as const,
    time_to_win: "days" as const,
    cost_model: "free" as const,
    cost_tier: "free" as const,
    deployment_models: values.deployment_models,
    aliases: splitCsv(values.aliases),
    tags: splitCsv(values.tags),
    auth_methods: values.auth_methods,
  };
}

/** Server shape → form shape for edit hydration (arrays → comma-separated). */
export function technologyToFormValues(
  technology: Technology,
): TechnologyFormValues {
  return {
    name: technology.name,
    slug: technology.slug,
    category_id: technology.category_id,
    description: technology.description,
    homepage_url: technology.homepage_url ?? "",
    maturity: technology.maturity,
    oss: technology.oss,
    deployment_models: technology.deployment_models,
    aliases: technology.aliases.join(", "),
    tags: technology.tags.join(", "),
    // The generated type marks `fields` optional (schema default); the form owns it.
    auth_methods: technology.auth_methods.map((method) => ({
      ...method,
      fields: method.fields ?? [],
    })),
  };
}

interface TechnologyFormProps {
  defaultValues: TechnologyFormValues;
  /** Server-backed values for Edit — RHF resets the form when they change. */
  values?: TechnologyFormValues;
  onSubmit: (values: TechnologyFormValues) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}

export function TechnologyForm({
  defaultValues,
  values,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: TechnologyFormProps) {
  const { t } = useTranslation();
  const { data: categoryTree } = useTechnologyCategoriesQuery();

  const categoryOptions = flattenCategories(categoryTree).map((category) => ({
    value: category.id,
    label: category.label,
  }));

  const form = useForm<TechnologyFormValues>({
    resolver: standardSchemaResolver(buildTechnologyFormSchema(t)),
    defaultValues,
    values,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-w-2xl flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField<TechnologyFormValues>
            name="name"
            label={t("technologies.form.name_label")}
          />
          <TextField<TechnologyFormValues>
            name="slug"
            label={t("technologies.form.slug_label")}
            description={t("technologies.form.slug_description")}
          />
        </div>
        <ComboboxField<TechnologyFormValues>
          name="category_id"
          label={t("technologies.form.category_label")}
          options={categoryOptions}
          placeholder={t("technologies.form.category_placeholder")}
          searchPlaceholder={t("technologies.form.category_search_placeholder")}
          emptyText={t("technologies.form.category_empty")}
        />
        <TextareaField<TechnologyFormValues>
          name="description"
          label={t("technologies.form.description_label")}
        />
        <TextField<TechnologyFormValues>
          name="homepage_url"
          label={t("technologies.form.homepage_url_label")}
          placeholder="https://"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<TechnologyFormValues>
            name="maturity"
            label={t("technologies.form.maturity_label")}
            options={MATURITIES.map((maturity) => ({
              value: maturity,
              label: t(`technologies.maturity.${maturity}`),
            }))}
          />
          <SelectField<TechnologyFormValues>
            name="oss"
            label={t("technologies.form.oss_label")}
            options={[
              { value: true, label: t("technologies.form.oss_yes") },
              { value: false, label: t("technologies.form.oss_no") },
            ]}
          />
        </div>
        <ComboboxField<TechnologyFormValues>
          name="deployment_models"
          multiple
          label={t("technologies.form.deployment_label")}
          options={DEPLOYMENT_MODELS.map((model) => ({
            value: model,
            label: t(`technologies.deployment.${model}`),
          }))}
          placeholder={t("technologies.form.deployment_placeholder")}
          searchPlaceholder={t(
            "technologies.form.deployment_search_placeholder",
          )}
          emptyText={t("technologies.form.deployment_empty")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField<TechnologyFormValues>
            name="aliases"
            label={t("technologies.form.aliases_label")}
            description={t("technologies.form.aliases_description")}
          />
          <TextField<TechnologyFormValues>
            name="tags"
            label={t("technologies.form.tags_label")}
            description={t("technologies.form.tags_description")}
          />
        </div>
        <AuthMethodsField />
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
