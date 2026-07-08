import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { BotIcon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { TextField } from "@/components/shared/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  useAddExclusionMutation,
  useExclusionsQuery,
  useRemoveExclusionMutation,
} from "../api";
import { type ExclusionFormValues, makeExclusionSchema } from "../schemas";

export function ExclusionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: exclusions } = useExclusionsQuery();
  const { mutate: addExclusion, isPending: isAdding } =
    useAddExclusionMutation();
  const { mutate: removeExclusion } = useRemoveExclusionMutation();

  const form = useForm<ExclusionFormValues>({
    resolver: standardSchemaResolver(makeExclusionSchema(t)),
    defaultValues: { pattern: "", reason: "", is_bot: false },
  });
  const isBot = form.watch("is_bot");

  const handleSubmit = (values: ExclusionFormValues) => {
    addExclusion(
      {
        pattern: values.pattern,
        reason: values.reason?.trim() ? values.reason.trim() : null,
        is_bot: values.is_bot,
      },
      {
        onSuccess: () => {
          toast.success(t("members.exclusions.added"));
          form.reset({ pattern: "", reason: "", is_bot: false });
        },
      },
    );
  };

  const handleRemove = (id: string) => {
    removeExclusion(id, {
      onSuccess: () => toast.success(t("members.exclusions.removed")),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("members.exclusions.title")}</DialogTitle>
          <DialogDescription>
            {t("members.exclusions.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-3"
          >
            <TextField<ExclusionFormValues>
              name="pattern"
              label={t("members.exclusions.pattern_label")}
              placeholder={t("members.exclusions.pattern_placeholder")}
              disabled={isAdding}
            />
            <TextField<ExclusionFormValues>
              name="reason"
              label={t("members.exclusions.reason_label")}
              placeholder={t("members.exclusions.reason_placeholder")}
              disabled={isAdding}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant={isBot ? "default" : "outline"}
                size="sm"
                onClick={() => form.setValue("is_bot", !isBot)}
                disabled={isAdding}
              >
                <BotIcon className="size-4" />
                {t("members.exclusions.is_bot")}
              </Button>
              <Button type="submit" size="sm" disabled={isAdding}>
                {t("members.exclusions.add")}
              </Button>
            </div>
          </form>
        </Form>

        <div className="overflow-hidden rounded-md border border-border">
          {exclusions && exclusions.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    {t("members.exclusions.col_pattern")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("members.exclusions.col_reason")}
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {exclusions.map((ex) => (
                  <tr key={ex.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <code className="font-mono text-xs">{ex.pattern}</code>
                        {ex.is_bot ? (
                          <Badge
                            variant="outline"
                            className="border-foreground/10 bg-muted"
                          >
                            {t("members.exclusions.col_bot")}
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {ex.reason ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("members.exclusions.remove")}
                        onClick={() => handleRemove(ex.id)}
                      >
                        <Trash2Icon
                          className={cn("size-4 text-muted-foreground")}
                        />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t("members.exclusions.empty")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
