import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  SelectField,
  TextField,
} from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { SelectItem } from "@/components/ui/select";
import { useConnectionsQuery } from "@/features/connectors/api";
import { useIngestRepositoryMutation } from "../api";
import { type IngestFormValues, makeIngestSchema } from "../schemas";

const NO_CONNECTION = "none";

export function IngestRepositoryDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate: ingest, isPending } = useIngestRepositoryMutation();
  const { data: connections } = useConnectionsQuery({
    page: 1,
    page_size: 100,
  });

  const form = useForm<IngestFormValues>({
    resolver: standardSchemaResolver(makeIngestSchema(t)),
    defaultValues: { url: "", connectionId: NO_CONNECTION },
  });

  const handleSubmit = (values: IngestFormValues) => {
    const connectionId =
      values.connectionId && values.connectionId !== NO_CONNECTION
        ? values.connectionId
        : null;
    ingest(
      { url: values.url, connectionId },
      {
        onSuccess: (repo) => {
          if (repo.status === "failed") {
            toast.error(
              t("repositories.ingest.toast_failed", { slug: repo.slug }),
              {
                description:
                  repo.error ?? t("repositories.ingest.toast_failed_desc"),
              },
            );
          } else {
            toast.success(
              t("repositories.ingest.toast_added", { slug: repo.slug }),
              {
                description: t("repositories.ingest.toast_added_desc"),
              },
            );
          }
          form.reset({ url: "", connectionId: NO_CONNECTION });
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Don't allow closing while a blocking ingest is in flight.
        if (isPending) return;
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon className="size-4" />
            {t("repositories.ingest.trigger")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{t("repositories.ingest.title")}</DialogTitle>
              <DialogDescription>
                {t("repositories.ingest.description")}
              </DialogDescription>
            </DialogHeader>

            <TextField<IngestFormValues>
              name="url"
              label={t("repositories.ingest.url.label")}
              type="url"
              autoFocus
              placeholder={t("repositories.ingest.placeholder")}
              disabled={isPending}
            />

            <SelectField<IngestFormValues>
              name="connectionId"
              label={t("repositories.ingest.connection.label")}
              description={t("repositories.ingest.connection.description")}
              disabled={isPending}
            >
              <SelectItem value={NO_CONNECTION}>
                {t("repositories.ingest.connection.none")}
              </SelectItem>
              {(connections?.items ?? []).map((connection) => (
                <SelectItem key={connection.id} value={connection.id}>
                  {connection.name}
                </SelectItem>
              ))}
            </SelectField>

            <FormFooter
              submitLabel={
                isPending
                  ? t("repositories.ingest.submitting")
                  : t("repositories.ingest.submit")
              }
              isPending={isPending}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
