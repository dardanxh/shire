import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  CheckboxField,
  FormFooter,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import type { NewsTopicOut } from "@/lib/api";
import {
  useAddSourceMutation,
  useCreateTopicMutation,
  useDeleteSourceMutation,
  useUpdateTopicMutation,
} from "../api";
import {
  makeSourceSchema,
  makeTopicSchema,
  type SourceFormValues,
  type TopicFormValues,
} from "../schemas";

/**
 * Create/edit a topic in a dialog. Sources are managed inline in edit mode
 * (each add/remove hits the API immediately); a freshly created topic gets its
 * sources on the follow-up edit.
 */
export function TopicFormDialog({
  topic,
  open,
  onOpenChange,
}: {
  topic?: NewsTopicOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(topic);

  const { mutate: createTopic, isPending: isCreating } =
    useCreateTopicMutation();
  const { mutate: updateTopic, isPending: isUpdating } = useUpdateTopicMutation(
    topic?.id ?? "",
  );
  const isPending = isCreating || isUpdating;

  const form = useForm<TopicFormValues>({
    resolver: standardSchemaResolver(makeTopicSchema(t)),
    defaultValues: { name: "", description: "", enabled: true },
    values: topic
      ? {
          name: topic.name,
          description: topic.description ?? "",
          enabled: topic.enabled,
        }
      : undefined,
  });

  const handleSubmit = (values: TopicFormValues) => {
    const body = {
      name: values.name,
      description: values.description.trim() || null,
      enabled: values.enabled,
    };
    if (topic) {
      updateTopic(body, {
        onSuccess: (updated) => {
          toast.success(
            t("news.topic_form.toast_saved", { name: updated.name }),
          );
          onOpenChange(false);
        },
      });
      return;
    }
    createTopic(body, {
      onSuccess: (created) => {
        toast.success(
          t("news.topic_form.toast_created", { name: created.name }),
        );
        form.reset();
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isPending) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>
                {isEdit
                  ? t("news.topic_form.edit_title")
                  : t("news.topic_form.new_title")}
              </DialogTitle>
              <DialogDescription>
                {t("news.topic_form.description_text")}
              </DialogDescription>
            </DialogHeader>

            <TextField<TopicFormValues>
              name="name"
              label={t("news.topic_form.name.label")}
              placeholder={t("news.topic_form.name.placeholder")}
              autoFocus
              disabled={isPending}
            />
            <TextareaField<TopicFormValues>
              name="description"
              label={t("news.topic_form.description.label")}
              placeholder={t("news.topic_form.description.placeholder")}
              rows={3}
              disabled={isPending}
            />
            <CheckboxField<TopicFormValues>
              name="enabled"
              label={t("news.topic_form.enabled.label")}
              disabled={isPending}
            />

            <FormFooter
              submitLabel={
                isEdit ? t("news.topic_form.save") : t("news.topic_form.create")
              }
              cancelLabel={t("common.actions.cancel")}
              onCancel={() => onOpenChange(false)}
              isPending={isPending}
            />
          </form>
        </Form>

        {topic ? <SourcesSection topic={topic} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Source URLs for one topic — sibling form to the topic form (forms can't nest). */
function SourcesSection({ topic }: { topic: NewsTopicOut }) {
  const { t } = useTranslation();
  const { mutate: addSource, isPending: isAdding } = useAddSourceMutation(
    topic.id,
  );
  const { mutate: deleteSource } = useDeleteSourceMutation(topic.id);

  const form = useForm<SourceFormValues>({
    resolver: standardSchemaResolver(makeSourceSchema(t)),
    defaultValues: { url: "", note: "" },
  });

  const handleAdd = (values: SourceFormValues) => {
    addSource(
      { url: values.url, note: values.note.trim() || null },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium">
        {t("news.topic_form.sources.title")}
      </p>

      {topic.sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("news.topic_form.sources.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {topic.sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs">{source.url}</p>
                {source.note ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {source.note}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("news.topic_form.sources.remove")}
                title={t("news.topic_form.sources.remove")}
                onClick={() => deleteSource(source.id)}
              >
                <Trash2Icon className="size-3.5 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleAdd)}
          className="flex items-start gap-2"
        >
          <div className="flex-1">
            <TextField<SourceFormValues>
              name="url"
              label=""
              placeholder={t("news.topic_form.sources.url_placeholder")}
              disabled={isAdding}
            />
          </div>
          <div className="w-40">
            <TextField<SourceFormValues>
              name="note"
              label=""
              placeholder={t("news.topic_form.sources.note_placeholder")}
              disabled={isAdding}
            />
          </div>
          <Button type="submit" variant="outline" disabled={isAdding}>
            <PlusIcon className="size-4" />
            {t("news.topic_form.sources.add")}
          </Button>
        </form>
      </Form>
    </div>
  );
}
