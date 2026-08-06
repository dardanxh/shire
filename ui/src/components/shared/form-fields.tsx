import { ChevronsUpDownIcon, InfoIcon, Loader2Icon, XIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import {
  type FieldPath,
  type FieldValues,
  useFormContext,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  /** Hover help: renders an info icon next to the label with this text in a tooltip. */
  info?: string;
};

/** The label line: plain label, or label + hoverable info icon when `info` is set.
 * `required` adds the conventional `*` marker (the control carries the real `required`). */
function FieldLabel({
  label,
  info,
  required,
}: {
  label: string;
  info?: string;
  required?: boolean;
}) {
  if (!info) return <FormLabel required={required}>{label}</FormLabel>;
  return (
    <div className="flex items-center gap-1.5">
      <FormLabel required={required}>{label}</FormLabel>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={info}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <InfoIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{info}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function TextField<T extends FieldValues>({
  name,
  label,
  description,
  info,
  ...inputProps
}: BaseFieldProps<T> & Omit<ComponentProps<typeof Input>, "name">) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {/* `required` rides along in the native input props: it marks the label and the
              control in one place, so the two can't drift apart. */}
          <FieldLabel
            label={label}
            info={info}
            required={inputProps.required}
          />
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

type SelectOptionValue = string | number | boolean;

export interface SelectFieldOption {
  value: SelectOptionValue;
  label: string;
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  description,
  info,
  placeholder,
  disabled,
  options,
  children,
}: BaseFieldProps<T> & {
  placeholder?: string;
  disabled?: boolean;
  /** Options as data; the field renders the `<SelectItem>`s itself. */
  options?: readonly SelectFieldOption[];
  /** The `<SelectItem>` options, rendered by the caller (alternative to `options`). */
  children?: ReactNode;
}) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) =>
        options ? (
          <FormItem>
            <FieldLabel label={label} info={info} />
            <Select<SelectOptionValue | null>
              items={options as SelectFieldOption[]}
              value={(field.value ?? null) as SelectOptionValue | null}
              onValueChange={(value) => field.onChange(value)}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="w-full" onBlur={field.onBlur}>
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={String(option.value)} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description ? (
              <FormDescription>{description}</FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        ) : (
          <FormItem>
            <FieldLabel label={label} info={info} />
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
        )
      }
    />
  );
}

export interface ComboboxFieldOption {
  value: string;
  label: string;
}

/**
 * Popover + Command picker. Single-value by default; `multiple` switches the
 * bound value to `string[]` and keeps the popover open while toggling.
 */
export function ComboboxField<T extends FieldValues>({
  name,
  label,
  description,
  info,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  multiple = false,
  disabled,
}: BaseFieldProps<T> & {
  options: readonly ComboboxFieldOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const { control } = useFormContext<T>();
  const [open, setOpen] = useState(false);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected: string[] = multiple
          ? ((field.value as string[] | undefined) ?? [])
          : field.value
            ? [field.value as string]
            : [];
        const selectedLabels = options
          .filter((option) => selected.includes(option.value))
          .map((option) => option.label);

        const toggle = (value: string) => {
          if (multiple) {
            field.onChange(
              selected.includes(value)
                ? selected.filter((item) => item !== value)
                : [...selected, value],
            );
          } else {
            field.onChange(value);
            setOpen(false);
          }
        };

        return (
          <FormItem>
            <FieldLabel label={label} info={info} />
            <Popover open={open} onOpenChange={setOpen}>
              <FormControl>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      disabled={disabled}
                      className="w-full justify-between font-normal"
                    />
                  }
                >
                  <span
                    className={cn(
                      "truncate",
                      selectedLabels.length === 0 && "text-muted-foreground",
                    )}
                  >
                    {selectedLabels.length > 0
                      ? selectedLabels.join(", ")
                      : placeholder}
                  </span>
                  <ChevronsUpDownIcon className="text-muted-foreground" />
                </PopoverTrigger>
              </FormControl>
              <PopoverContent className="w-(--anchor-width) p-0" align="start">
                <Command>
                  <CommandInput placeholder={searchPlaceholder} />
                  <CommandList>
                    <CommandEmpty>{emptyText}</CommandEmpty>
                    <CommandGroup>
                      {options.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          data-checked={
                            selected.includes(option.value) ? "true" : undefined
                          }
                          onSelect={() => toggle(option.value)}
                        >
                          {option.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {description ? (
              <FormDescription>{description}</FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  name,
  label,
  description,
  info,
  ...textareaProps
}: BaseFieldProps<T> & Omit<ComponentProps<typeof Textarea>, "name">) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FieldLabel
            label={label}
            info={info}
            required={textareaProps.required}
          />
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

export function SwitchField<T extends FieldValues>({
  name,
  label,
  description,
  info,
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
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={(checked) => field.onChange(checked)}
              onBlur={field.onBlur}
              disabled={disabled}
            />
          </FormControl>
          <FieldLabel label={label} info={info} />
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
            <Checkbox
              checked={Boolean(field.value)}
              onCheckedChange={(checked) => field.onChange(checked)}
              onBlur={field.onBlur}
              disabled={disabled}
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

export function SliderField<T extends FieldValues>({
  name,
  label,
  description,
  info,
  min = 1,
  max = 5,
  step = 1,
  disabled,
  formatValue,
}: BaseFieldProps<T> & {
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Render the current value as a word ("Critical") instead of the bare number. */
  formatValue?: (value: number) => string;
}) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = Number(field.value ?? min);
        return (
          <FormItem>
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel label={label} info={info} />
              <span className="text-sm font-medium tabular-nums">
                {formatValue ? formatValue(value) : value}
              </span>
            </div>
            <FormControl>
              <Slider
                value={value}
                onValueChange={(next) =>
                  // base-ui emits number | number[] depending on thumb count; this is single-thumb.
                  field.onChange(Array.isArray(next) ? next[0] : next)
                }
                onBlur={field.onBlur}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
              />
            </FormControl>
            {description ? (
              <FormDescription>{description}</FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

export function TagsField<T extends FieldValues>({
  name,
  label,
  description,
  info,
  placeholder,
  disabled,
}: BaseFieldProps<T> & { placeholder?: string; disabled?: boolean }) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const tags: string[] = Array.isArray(field.value) ? field.value : [];
        const add = (raw: string) => {
          const trimmed = raw.trim().replace(/,$/, "").trim();
          if (!trimmed) return;
          // Case-insensitive de-dupe: two chips differing only in case read as a UI bug.
          if (tags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase()))
            return;
          field.onChange([...tags, trimmed]);
        };
        return (
          <FormItem>
            <FieldLabel label={label} info={info} />
            <FormControl>
              <Input
                placeholder={placeholder}
                disabled={disabled}
                onBlur={(event) => {
                  // Commit whatever is half-typed: losing a tag because the user clicked away
                  // instead of pressing Enter is the classic chip-input annoyance.
                  add(event.target.value);
                  event.target.value = "";
                  field.onBlur();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    add(event.currentTarget.value);
                    event.currentTarget.value = "";
                  } else if (
                    event.key === "Backspace" &&
                    event.currentTarget.value === "" &&
                    tags.length > 0
                  ) {
                    field.onChange(tags.slice(0, -1));
                  }
                }}
              />
            </FormControl>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      field.onChange(tags.filter((t) => t !== tag))
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs",
                      "hover:bg-muted/70 disabled:cursor-not-allowed",
                    )}
                  >
                    {tag}
                    <XIcon className="size-3" />
                  </button>
                ))}
              </div>
            ) : null}
            {description ? (
              <FormDescription>{description}</FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        );
      }}
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
