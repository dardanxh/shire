import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useAssignMembersMutation,
  useCreateTeamMutation,
  useTeamsQuery,
} from "../api";
import { TEAM_PALETTE } from "../schemas";

/** Sentinel Select value for the "create a new team" option. */
const NEW_TEAM = "__new__";

export interface AssignableMember {
  id: string;
  email: string;
}

export function AssignTeamDialog({
  open,
  onOpenChange,
  members,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: AssignableMember[];
  onAssigned?: () => void;
}) {
  const { t } = useTranslation();
  const { data: teams } = useTeamsQuery();
  const { mutateAsync: createTeam } = useCreateTeamMutation();
  const { mutateAsync: assignMembers, isPending } = useAssignMembersMutation();

  const [selected, setSelected] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TEAM_PALETTE[0]);
  const creatingNew = selected === NEW_TEAM;

  const canSubmit =
    members.length > 0 &&
    (creatingNew ? newName.trim().length > 0 : selected !== "");

  const handleAssign = async () => {
    try {
      let teamId = selected;
      if (creatingNew) {
        const team = await createTeam({
          name: newName.trim(),
          color: newColor,
        });
        teamId = team.id;
      }
      await assignMembers({
        teamId,
        members: members.map((m) => ({ id: m.id, email: m.email })),
      });
      toast.success(t("teams.assign.done", { count: members.length }));
      onAssigned?.();
      onOpenChange(false);
      setSelected("");
      setNewName("");
    } catch {
      // Errors surface via the global mutation handler; the dialog stays open for retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("teams.assign.title", { count: members.length })}
          </DialogTitle>
          <DialogDescription>{t("teams.assign.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Select value={selected} onValueChange={(v) => setSelected(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("teams.assign.pick_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {(teams ?? []).map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    {team.name}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value={NEW_TEAM}>
                {t("teams.assign.new_team")}
              </SelectItem>
            </SelectContent>
          </Select>

          {creatingNew ? (
            <div className="space-y-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("teams.form.name_placeholder")}
                aria-label={t("teams.form.name_label")}
              />
              <div className="flex flex-wrap gap-1.5">
                {TEAM_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={t("teams.form.pick_color", { color })}
                    onClick={() => setNewColor(color)}
                    className={cn(
                      "size-6 rounded-full border border-border transition-transform hover:scale-110",
                      newColor.toLowerCase() === color.toLowerCase() &&
                        "ring-2 ring-ring ring-offset-1 ring-offset-background",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("common.actions.cancel")}
          </Button>
          <Button onClick={handleAssign} disabled={!canSubmit || isPending}>
            {t("teams.assign.confirm", { count: members.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
