import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { StarIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { TextareaField } from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { HobitRunFeedbackOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useDeleteRunFeedbackMutation,
  useUpsertRunFeedbackMutation,
} from "../api";
import { makeRunFeedbackSchema, type RunFeedbackFormValues } from "../schemas";

const STARS = [1, 2, 3, 4, 5] as const;

/** Rate a run's response (1-5 stars + optional comment). The rating tunes the hobit's future
 * runs — raw in its next prompt, distilled into standing guidance over time. */
export function RunFeedback({
  repoId,
  runId,
  feedback,
}: {
  repoId: string;
  runId: string;
  feedback: HobitRunFeedbackOut | null;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(0);
  const { mutate: save, isPending: isSaving } = useUpsertRunFeedbackMutation(
    repoId,
    runId,
  );
  const { mutate: remove, isPending: isRemoving } =
    useDeleteRunFeedbackMutation(repoId, runId);

  const form = useForm<RunFeedbackFormValues>({
    resolver: standardSchemaResolver(makeRunFeedbackSchema(t)),
    defaultValues: { rating: 0, comment: "" },
    // Server-mirror: reseeds whenever the fetched feedback changes (reopen, other run, etc.).
    values: feedback
      ? { rating: feedback.rating, comment: feedback.comment ?? "" }
      : undefined,
  });

  const onSubmit = (values: RunFeedbackFormValues) => {
    save(
      { rating: values.rating, comment: values.comment.trim() || null },
      { onSuccess: () => toast.success(t("briefing.feedback.saved_toast")) },
    );
  };

  const onRemove = () => {
    remove(undefined, {
      onSuccess: () => {
        form.reset({ rating: 0, comment: "" });
        toast.success(t("briefing.feedback.removed_toast"));
      },
    });
  };

  const isPending = isSaving || isRemoving;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        {/* One-of-a-kind star input — not a shared form-field candidate. */}
        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("briefing.feedback.title")}</FormLabel>
              <FormControl>
                <div
                  role="radiogroup"
                  aria-label={t("briefing.feedback.title")}
                  className="flex items-center gap-0.5"
                  onMouseLeave={() => setHovered(0)}
                >
                  {STARS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={t("briefing.feedback.star_label", { n })}
                      disabled={isPending}
                      onMouseEnter={() => setHovered(n)}
                      onClick={() => field.onChange(n)}
                      className="p-0.5"
                    >
                      <StarIcon
                        className={cn(
                          "size-5 transition-colors",
                          n <= (hovered || field.value)
                            ? "fill-primary text-primary"
                            : "text-muted-foreground/40",
                        )}
                      />
                    </button>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextareaField<RunFeedbackFormValues>
          name="comment"
          label={t("briefing.feedback.comment_label")}
          placeholder={t("briefing.feedback.comment_placeholder")}
          rows={2}
          disabled={isPending}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {feedback
              ? t("briefing.feedback.update")
              : t("briefing.feedback.save")}
          </Button>
          {feedback ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={isPending}
              onClick={onRemove}
            >
              {t("briefing.feedback.remove")}
            </Button>
          ) : null}
        </div>
      </form>
    </Form>
  );
}
