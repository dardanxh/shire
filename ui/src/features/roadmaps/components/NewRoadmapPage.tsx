import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { RepoMultiSelect } from "@/components/shared/RepoMultiSelect";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateRoadmapMutation } from "../api";
import { type RoadmapFormValues, roadmapFormSchema } from "../schemas";

/** Create a roadmap: name + optional goal + the repositories it plans over. */
export function NewRoadmapPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate: createRoadmap, isPending } = useCreateRoadmapMutation();

  const form = useForm<RoadmapFormValues>({
    resolver: standardSchemaResolver(roadmapFormSchema),
    defaultValues: { name: "", goal: "", repository_ids: [] },
  });

  const handleSubmit = (values: RoadmapFormValues) => {
    createRoadmap(
      {
        name: values.name,
        goal: values.goal.trim() || null,
        repository_ids: values.repository_ids,
      },
      {
        onSuccess: (roadmap) => {
          toast.success(t("roadmaps.new.toast_success"));
          navigate({
            to: "/roadmaps/$id",
            params: { id: roadmap.id },
            search: { tab: "board" },
          });
        },
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* The crumb names the page; this line is form guidance, not a title. */}
      <p className="text-sm text-muted-foreground">
        {t("roadmaps.new.subtitle")}
      </p>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-5"
          noValidate
        >
          <TextField<RoadmapFormValues>
            name="name"
            label={t("roadmaps.new.name_label")}
            placeholder={t("roadmaps.new.name_placeholder")}
          />
          <TextareaField<RoadmapFormValues>
            name="goal"
            label={t("roadmaps.new.goal_label")}
            description={t("roadmaps.new.goal_help")}
            placeholder={t("roadmaps.new.goal_placeholder")}
            rows={4}
          />
          <FormField
            control={form.control}
            name="repository_ids"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("roadmaps.new.repos_label")}</FormLabel>
                <RepoMultiSelect
                  selected={new Set(field.value)}
                  onToggle={(repoId) =>
                    field.onChange(
                      field.value.includes(repoId)
                        ? field.value.filter((id) => id !== repoId)
                        : [...field.value, repoId],
                    )
                  }
                  searchPlaceholder={t("roadmaps.new.repo_search_placeholder")}
                  emptyLabel={t("roadmaps.new.no_repositories")}
                  loadingLabel={t("common.states.loading")}
                  subdirLabel={t("common.labels.subdir")}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormFooter
            submitLabel={t("roadmaps.new.submit")}
            cancelLabel={t("common.actions.cancel")}
            isPending={isPending}
            onCancel={() =>
              navigate({ to: "/roadmaps", search: { page: 1, size: 20 } })
            }
          />
        </form>
      </Form>
    </div>
  );
}
