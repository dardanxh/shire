import { Loader2Icon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepositoriesQuery } from "@/features/repositories/api";
import { useRunHobitMutation } from "../api";

/** Run this hobit against a chosen repository (blocking — the agent explores the clone). */
export function HobitRunner({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [repoId, setRepoId] = useState("");
  const { data: repos } = useRepositoriesQuery({ page: 1, page_size: 200 });
  const { mutate: run, isPending } = useRunHobitMutation(slug);

  const items = repos?.items ?? [];

  const handleRun = () => {
    if (!repoId) return;
    run(repoId, {
      onSuccess: (data) =>
        toast.success(t("hobits.run_on.toast_done", { status: data.status })),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hobits.run_on.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("hobits.run_on.desc")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={repoId}
            onValueChange={(v) => setRepoId(v ?? "")}
            disabled={isPending}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder={t("hobits.run_on.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {items.map((repo) => (
                <SelectItem key={repo.id} value={repo.id}>
                  {repo.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleRun} disabled={isPending || !repoId} size="sm">
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlayIcon className="size-4" />
            )}
            {isPending ? t("hobits.run_on.running") : t("hobits.run_on.run")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
