import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { CheckIcon, DicesIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import type { TeamOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useTeamsQuery,
  useUpdateTeamMutation,
} from "../api";
import { makeTeamSchema, TEAM_PALETTE, type TeamFormValues } from "../schemas";

/** A random 6-digit hex color, e.g. "#3fa9c1". */
function randomHexColor() {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`;
}

/**
 * A row of clickable palette swatches; the active color gets a ring. A dice
 * button picks a random color, and any off-palette color is shown as an extra
 * selected swatch so it stays visible/editable.
 */
function ColorSwatches({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const isCustom = !TEAM_PALETTE.some(
    (color) => color.toLowerCase() === value.toLowerCase(),
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TEAM_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          aria-label={t("teams.form.pick_color", { color })}
          onClick={() => onChange(color)}
          className={cn(
            "size-6 rounded-full border border-border transition-transform hover:scale-110",
            value.toLowerCase() === color.toLowerCase() &&
              "ring-2 ring-ring ring-offset-1 ring-offset-background",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
      {isCustom ? (
        <span
          role="img"
          aria-label={t("teams.form.pick_color", { color: value })}
          className="size-6 rounded-full border border-border ring-2 ring-ring ring-offset-1 ring-offset-background"
          style={{ backgroundColor: value }}
        />
      ) : null}
      <button
        type="button"
        disabled={disabled}
        aria-label={t("teams.form.random_color")}
        title={t("teams.form.random_color")}
        onClick={() => onChange(randomHexColor())}
        className="flex size-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <DicesIcon className="size-3.5" />
      </button>
    </div>
  );
}

/** One existing team: recolor + rename inline, or delete. */
function TeamRow({ team }: { team: TeamOut }) {
  const { t } = useTranslation();
  const { mutate: updateTeam, isPending: isSaving } = useUpdateTeamMutation();
  const { mutate: deleteTeam } = useDeleteTeamMutation();
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  const dirty = name.trim() !== team.name || color !== team.color;

  const save = () => {
    if (!name.trim()) return;
    updateTeam(
      { id: team.id, body: { name: name.trim(), color } },
      { onSuccess: () => toast.success(t("teams.manage.saved")) },
    );
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8"
          aria-label={t("teams.manage.name_label")}
        />
        <Badge
          variant="outline"
          className="shrink-0 border-foreground/10 bg-muted"
        >
          {t("teams.manage.member_count", { count: team.member_count })}
        </Badge>
        {dirty ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={save}
            aria-label={t("teams.manage.save")}
          >
            <CheckIcon className="size-4" />
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t("teams.manage.delete")}
          onClick={() =>
            deleteTeam(team.id, {
              onSuccess: () => toast.success(t("teams.manage.deleted")),
            })
          }
        >
          <Trash2Icon className="size-4 text-muted-foreground" />
        </Button>
      </div>
      <ColorSwatches value={color} onChange={setColor} disabled={isSaving} />
    </div>
  );
}

export function ManageTeamsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: teams } = useTeamsQuery();
  const { mutate: createTeam, isPending: isAdding } = useCreateTeamMutation();

  const form = useForm<TeamFormValues>({
    resolver: standardSchemaResolver(makeTeamSchema(t)),
    defaultValues: { name: "", color: TEAM_PALETTE[0], description: "" },
  });
  const color = form.watch("color");

  const handleSubmit = (values: TeamFormValues) => {
    createTeam(
      {
        name: values.name,
        color: values.color,
        description: values.description?.trim()
          ? values.description.trim()
          : null,
      },
      {
        onSuccess: () => {
          toast.success(t("teams.manage.created"));
          form.reset({ name: "", color: TEAM_PALETTE[0], description: "" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("teams.manage.title")}</DialogTitle>
          <DialogDescription>{t("teams.manage.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-3"
          >
            <TextField<TeamFormValues>
              name="name"
              label={t("teams.form.name_label")}
              placeholder={t("teams.form.name_placeholder")}
              disabled={isAdding}
            />
            <div className="space-y-1.5">
              <span className="text-sm font-medium">
                {t("teams.form.color_label")}
              </span>
              <ColorSwatches
                value={color}
                onChange={(c) => form.setValue("color", c)}
                disabled={isAdding}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isAdding}>
                {t("teams.manage.add")}
              </Button>
            </div>
          </form>
        </Form>

        <div className="overflow-hidden rounded-md border border-border">
          {teams && teams.length > 0 ? (
            teams.map((team) => <TeamRow key={team.id} team={team} />)
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t("teams.manage.empty")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
