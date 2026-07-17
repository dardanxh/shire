import { CheckIcon } from "lucide-react";
import {
  type FieldPath,
  type FieldValues,
  useFormContext,
} from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { HOBIT_MODELS } from "../schemas";

/**
 * Single-select model cards (RHF field, value = the CLI model alias). The selected card
 * carries a solid green check badge.
 */
export function ModelPickerField<T extends FieldValues>({
  name,
  label,
  disabled,
}: {
  name: FieldPath<T>;
  label: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <div className="grid gap-2 sm:grid-cols-2">
              {HOBIT_MODELS.map((model) => {
                const selected = field.value === model.alias;
                return (
                  <button
                    key={model.alias}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => field.onChange(model.alias)}
                    className={cn(
                      "relative rounded-lg border bg-card p-3 pr-10 text-left transition-colors",
                      selected
                        ? "border-green-600"
                        : "hover:border-muted-foreground/40",
                    )}
                  >
                    <span className="text-sm font-medium">{model.name}</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {model.version} · {t(`hobits.models.${model.alias}`)}
                    </p>
                    {selected ? (
                      <span className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full bg-green-600">
                        <CheckIcon className="size-3 text-white" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
