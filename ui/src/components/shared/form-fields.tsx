import { Loader2Icon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
  type FieldPath,
  type FieldValues,
  useFormContext,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Shared RHF field components. They read `control` from `useFormContext<T>()`
 * internally — pass an explicit generic (`<TextField<MyValues> …>`) so `name`
 * is type-checked. New input types get a new field component here first, rather
 * than an inline `<FormField>` in a feature form.
 */

type BaseFieldProps<T extends FieldValues> = {
  name: FieldPath<T>;
  label: string;
  description?: ReactNode;
};

export function TextField<T extends FieldValues>({
  name,
  label,
  description,
  ...inputProps
}: BaseFieldProps<T> & Omit<ComponentProps<typeof Input>, "name">) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} {...inputProps} />
          </FormControl>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  description,
  placeholder,
  disabled,
  children,
}: BaseFieldProps<T> & {
  placeholder?: string;
  disabled?: boolean;
  /** The `<SelectItem>` options, rendered by the caller. */
  children: ReactNode;
}) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select<string>
            value={field.value ?? ""}
            onValueChange={(value) => field.onChange(value)}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger onBlur={field.onBlur}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>{children}</SelectContent>
          </Select>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  name,
  label,
  description,
  ...textareaProps
}: BaseFieldProps<T> & Omit<ComponentProps<typeof Textarea>, "name">) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...field} {...textareaProps} />
          </FormControl>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({
  name,
  label,
  description,
  disabled,
}: BaseFieldProps<T> & { disabled?: boolean }) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center gap-2 space-y-0">
          <FormControl>
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(e) => field.onChange(e.target.checked)}
              onBlur={field.onBlur}
              disabled={disabled}
              className="size-4 rounded border border-input accent-primary"
            />
          </FormControl>
          <FormLabel className="font-normal">{label}</FormLabel>
          {description ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function FormFooter({
  submitLabel,
  cancelLabel,
  onCancel,
  isPending,
}: {
  submitLabel: string;
  cancelLabel?: string;
  onCancel?: () => void;
  isPending?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {onCancel ? (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
