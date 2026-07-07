import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FormFooter, TextField } from "@/components/shared/form-fields";
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
import { useIngestRepositoryMutation } from "../api";
import { type IngestFormValues, makeIngestSchema } from "../schemas";

export function IngestRepositoryDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate: ingest, isPending } = useIngestRepositoryMutation();

  const form = useForm<IngestFormValues>({
    resolver: standardSchemaResolver(makeIngestSchema(t)),
    defaultValues: { url: "" },
  });

  const handleSubmit = (values: IngestFormValues) => {
    ingest(values.url, {
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
        form.reset({ url: "" });
        setOpen(false);
      },
    });
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
