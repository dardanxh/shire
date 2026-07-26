import { PlusIcon, Trash2Icon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { CheckboxField, TextField } from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import type { TechnologyFormValues } from "../schemas";

/**
 * Repeatable-rows editor for a technology's auth methods: an outer field array
 * of methods, each with a nested field array of credential fields.
 */
export function AuthMethodsField() {
  const { t } = useTranslation();
  const { control } = useFormContext<TechnologyFormValues>();
  const methods = useFieldArray({ control, name: "auth_methods" });

  return (
    <fieldset className="flex flex-col gap-3">
      <div>
        <legend className="text-sm font-medium">
          {t("technologies.auth_methods.title")}
        </legend>
        <p className="text-sm text-muted-foreground">
          {t("technologies.auth_methods.description")}
        </p>
      </div>
      {methods.fields.map((method, methodIndex) => (
        <div
          key={method.id}
          className="flex flex-col gap-3 rounded-lg border p-3"
        >
          <div className="flex items-end gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <TextField<TechnologyFormValues>
                name={`auth_methods.${methodIndex}.name`}
                label={t("technologies.auth_methods.method_name_label")}
                placeholder={t(
                  "technologies.auth_methods.method_name_placeholder",
                )}
              />
              <TextField<TechnologyFormValues>
                name={`auth_methods.${methodIndex}.slug`}
                label={t("technologies.auth_methods.method_slug_label")}
                placeholder="username_password"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("technologies.auth_methods.remove_method")}
              onClick={() => methods.remove(methodIndex)}
            >
              <Trash2Icon />
            </Button>
          </div>
          <MethodFields methodIndex={methodIndex} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => methods.append({ slug: "", name: "", fields: [] })}
      >
        <PlusIcon />
        {t("technologies.auth_methods.add_method")}
      </Button>
    </fieldset>
  );
}

function MethodFields({ methodIndex }: { methodIndex: number }) {
  const { t } = useTranslation();
  const { control } = useFormContext<TechnologyFormValues>();
  const fields = useFieldArray({
    control,
    name: `auth_methods.${methodIndex}.fields`,
  });

  return (
    <div className="flex flex-col gap-2 border-l pl-3">
      {fields.fields.map((field, fieldIndex) => (
        <div key={field.id} className="flex flex-wrap items-end gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <TextField<TechnologyFormValues>
              name={`auth_methods.${methodIndex}.fields.${fieldIndex}.label`}
              label={t("technologies.auth_methods.field_label_label")}
              placeholder={t(
                "technologies.auth_methods.field_label_placeholder",
              )}
            />
            <TextField<TechnologyFormValues>
              name={`auth_methods.${methodIndex}.fields.${fieldIndex}.key`}
              label={t("technologies.auth_methods.field_key_label")}
              placeholder="password"
            />
          </div>
          <div className="flex items-center gap-3 pb-2">
            <CheckboxField<TechnologyFormValues>
              name={`auth_methods.${methodIndex}.fields.${fieldIndex}.secret`}
              label={t("technologies.auth_methods.field_secret_label")}
            />
            <CheckboxField<TechnologyFormValues>
              name={`auth_methods.${methodIndex}.fields.${fieldIndex}.required`}
              label={t("technologies.auth_methods.field_required_label")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("technologies.auth_methods.remove_field")}
              onClick={() => fields.remove(fieldIndex)}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() =>
          fields.append({ key: "", label: "", secret: false, required: true })
        }
      >
        <PlusIcon />
        {t("technologies.auth_methods.add_field")}
      </Button>
    </div>
  );
}
