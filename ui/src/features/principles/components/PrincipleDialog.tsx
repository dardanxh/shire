import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { TFunction } from "i18next";
import type { ReactElement } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import {
  CheckboxField,
  FormFooter,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { SelectItem } from "@/components/ui/select";
import { useRepositoriesQuery } from "@/features/repositories/api";
import { PRINCIPLE_SEVERITIES, type PrincipleOut } from "@/lib/api";
import { useCreatePrincipleMutation, useUpdatePrincipleMutation } from "../api";

const ALL_REPOS = "__all__";

function makeSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(1, t("principles.form.name.required")),
    statement: z
      .string()
      .trim()
      .min(1, t("principles.form.statement.required")),
    severity: z.string(),
    repository_id: z.string(),
    enabled: z.boolean(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/** Create (no `principle`) or edit (with `principle`) a principle. `trigger` opens it. */
export function PrincipleDialog({
  trigger,
  principle,
}: {
  trigger: ReactElement;
  principle?: PrincipleOut;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        {open ? (
          <PrincipleForm principle={principle} onDone={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PrincipleForm({
  principle,
  onDone,
}: {
  principle?: PrincipleOut;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { data: repos } = useRepositoriesQuery({ page: 1, page_size: 100 });
  const { mutate: create, isPending: creating } = useCreatePrincipleMutation();
  const { mutate: update, isPending: updating } = useUpdatePrincipleMutation(
    principle?.id ?? "",
  );
  const isPending = creating || updating;

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(makeSchema(t)),
    defaultValues: {
      name: principle?.name ?? "",
      statement: principle?.statement ?? "",
      severity: principle?.severity ?? "warning",
      repository_id: principle?.repository_id ?? ALL_REPOS,
      enabled: principle?.enabled ?? true,
    },
  });

  const onSubmit = (values: FormValues) => {
    const body = {
      name: values.name,
      statement: values.statement,
      severity: values.severity,
      repository_id:
        values.repository_id === ALL_REPOS ? null : values.repository_id,
      enabled: values.enabled,
    };
    const done = () => {
      toast.success(
        t(principle ? "principles.form.saved" : "principles.form.created"),
      );
      onDone();
    };
    if (principle) update(body, { onSuccess: done });
    else create(body, { onSuccess: done });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(
            principle ? "principles.form.edit_title" : "principles.form.title",
          )}
        </DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <TextField<FormValues>
            name="name"
            label={t("principles.form.name.label")}
            placeholder={t("principles.form.name.placeholder")}
            disabled={isPending}
          />
          <TextareaField<FormValues>
            name="statement"
            label={t("principles.form.statement.label")}
            description={t("principles.form.statement.desc")}
            rows={5}
            disabled={isPending}
          />
          <SelectField<FormValues>
            name="severity"
            label={t("principles.form.severity.label")}
            disabled={isPending}
          >
            {PRINCIPLE_SEVERITIES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {t(`principles.severity.${s}`)}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField<FormValues>
            name="repository_id"
            label={t("principles.form.scope.label")}
            description={t("principles.form.scope.desc")}
            disabled={isPending}
          >
            <SelectItem value={ALL_REPOS}>
              {t("principles.form.scope.all")}
            </SelectItem>
            {(repos?.items ?? []).map((repo: { id: string; slug: string }) => (
              <SelectItem key={repo.id} value={repo.id}>
                {repo.slug}
              </SelectItem>
            ))}
          </SelectField>
          <CheckboxField<FormValues>
            name="enabled"
            label={t("principles.form.enabled.label")}
            disabled={isPending}
          />
          <FormFooter
            submitLabel={t("principles.form.save")}
            isPending={isPending}
          />
        </form>
      </Form>
    </>
  );
}
