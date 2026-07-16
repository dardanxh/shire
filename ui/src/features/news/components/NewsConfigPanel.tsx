import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { InfoIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  SelectField,
  TextField,
} from "@/components/shared/form-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { NewsConfigOut } from "@/lib/api";
import { useNewsConfigQuery, useUpdateNewsConfigMutation } from "../api";
import {
  CADENCE_PRESETS,
  type ConfigFormValues,
  makeConfigSchema,
} from "../schemas";

export function NewsConfigPanel() {
  const { data: config, isPending } = useNewsConfigQuery();

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (!config) return null;
  return <ConfigForm config={config} />;
}

function ConfigForm({ config }: { config: NewsConfigOut }) {
  const { t } = useTranslation();
  const { mutate: save, isPending } = useUpdateNewsConfigMutation();

  const isCron = config.cadence.startsWith("cron:");
  const form = useForm<ConfigFormValues>({
    resolver: standardSchemaResolver(makeConfigSchema(t)),
    defaultValues: {
      cadence: isCron
        ? "custom"
        : (config.cadence as ConfigFormValues["cadence"]),
      cron: isCron ? config.cadence.slice("cron:".length) : "",
      max_items_per_topic: String(config.max_items_per_topic),
    },
  });

  const cadence = form.watch("cadence");

  const onSubmit = (values: ConfigFormValues) => {
    save(
      {
        cadence:
          values.cadence === "custom" ? `cron:${values.cron}` : values.cadence,
        max_items_per_topic: Number(values.max_items_per_topic),
      },
      { onSuccess: () => toast.success(t("news.config.saved_toast")) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("news.config.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="max-w-md space-y-4"
          >
            <SelectField<ConfigFormValues>
              name="cadence"
              label={t("news.config.cadence.label")}
              disabled={isPending}
            >
              {CADENCE_PRESETS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`news.config.cadence.${c}`)}
                </SelectItem>
              ))}
              <SelectItem value="custom">
                {t("news.config.cadence.custom")}
              </SelectItem>
            </SelectField>

            {cadence === "custom" ? (
              <TextField<ConfigFormValues>
                name="cron"
                label={t("news.config.cron.label")}
                placeholder={t("news.config.cron.placeholder")}
                disabled={isPending}
              />
            ) : null}

            <TextField<ConfigFormValues>
              name="max_items_per_topic"
              label={t("news.config.max_items.label")}
              disabled={isPending}
            />

            {!config.scheduler_enabled && cadence !== "manual" ? (
              <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <InfoIcon className="mt-0.5 size-4 shrink-0" />
                {t("news.config.scheduler_disabled_hint")}
              </p>
            ) : null}

            <FormFooter
              submitLabel={t("news.config.save")}
              isPending={isPending}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
