import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { TFunction } from "i18next";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import {
  FormFooter,
  SelectField,
  TextField,
} from "@/components/shared/form-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { EngineConfigOut } from "@/lib/api";
import { useEngineConfigQuery, useUpdateEngineConfigMutation } from "../api";

function makeEngineConfigSchema(t: TFunction) {
  const bounded = (min: number, max: number, message: string) =>
    z.string().refine((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max;
    }, message);
  return z.object({
    model: z.string().trim().min(1),
    timeout_seconds: bounded(30, 3600, t("jobs.config.timeout.invalid")),
    max_attempts: bounded(1, 5, t("jobs.config.attempts.invalid")),
    concurrency: bounded(1, 16, t("jobs.config.concurrency.invalid")),
    retention_days: bounded(0, 365, t("jobs.config.retention.invalid")),
  });
}

type EngineConfigFormValues = z.infer<
  ReturnType<typeof makeEngineConfigSchema>
>;

export function JobsConfigPanel() {
  const { t } = useTranslation();
  const { data: config, isPending } = useEngineConfigQuery();

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (!config) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        {t("common.states.error_title")}
      </p>
    );
  }
  return <ConfigForm config={config} />;
}

function ConfigForm({ config }: { config: EngineConfigOut }) {
  const { t } = useTranslation();
  const { mutate: save, isPending } = useUpdateEngineConfigMutation();

  const form = useForm<EngineConfigFormValues>({
    resolver: standardSchemaResolver(makeEngineConfigSchema(t)),
    defaultValues: {
      model: config.model,
      timeout_seconds: String(config.timeout_seconds),
      max_attempts: String(config.max_attempts),
      concurrency: String(config.concurrency),
      retention_days: String(config.retention_days),
    },
  });

  const onSubmit = (values: EngineConfigFormValues) => {
    save(
      {
        model: values.model,
        timeout_seconds: Number(values.timeout_seconds),
        max_attempts: Number(values.max_attempts),
        concurrency: Number(values.concurrency),
        retention_days: Number(values.retention_days),
      },
      { onSuccess: () => toast.success(t("jobs.config.saved_toast")) },
    );
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t("jobs.config.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("jobs.config.desc")}</p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <SelectField<EngineConfigFormValues>
              name="model"
              label={t("jobs.config.model.label")}
              description={t("jobs.config.model.desc")}
              disabled={isPending}
            >
              {config.available_models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectField>
            <TextField<EngineConfigFormValues>
              name="timeout_seconds"
              type="number"
              label={t("jobs.config.timeout.label")}
              description={t("jobs.config.timeout.desc")}
              disabled={isPending}
            />
            <TextField<EngineConfigFormValues>
              name="max_attempts"
              type="number"
              label={t("jobs.config.attempts.label")}
              description={t("jobs.config.attempts.desc")}
              disabled={isPending}
            />
            <TextField<EngineConfigFormValues>
              name="concurrency"
              type="number"
              label={t("jobs.config.concurrency.label")}
              description={t("jobs.config.concurrency.desc")}
              disabled={isPending}
            />
            <TextField<EngineConfigFormValues>
              name="retention_days"
              type="number"
              label={t("jobs.config.retention.label")}
              description={t("jobs.config.retention.desc")}
              disabled={isPending}
            />
            <FormFooter
              submitLabel={t("jobs.config.save")}
              isPending={isPending}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
