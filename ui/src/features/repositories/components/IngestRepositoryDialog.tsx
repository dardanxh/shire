import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { HobitMultiSelect } from "@/components/shared/HobitMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConnectionsQuery } from "@/features/connectors/api";
import { useHobitsQuery } from "@/features/hobits/api";
import { useToolsQuery } from "@/features/tools/api";
import { useIngestRepositoryMutation, useSetRepoHobitsMutation } from "../api";
import { ToolPicker } from "./ToolPicker";

const NO_CONNECTION = "none";
const STEPS = ["details", "tools", "hobits", "confirm"] as const;

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function IngestRepositoryDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [connectionId, setConnectionId] = useState(NO_CONNECTION);
  const [tools, setTools] = useState<Set<string>>(new Set());
  const [hobits, setHobits] = useState<Set<string>>(new Set());

  const { data: connections } = useConnectionsQuery({
    page: 1,
    page_size: 100,
  });
  const { data: toolCatalog } = useToolsQuery();
  const { data: hobitCatalog } = useHobitsQuery();
  const { mutate: ingest, isPending } = useIngestRepositoryMutation();
  const setRepoHobits = useSetRepoHobitsMutation();

  const hobitOptions = useMemo(
    () =>
      (hobitCatalog ?? [])
        .filter((h) => h.category !== "Foundational")
        .map((h) => ({
          slug: h.slug,
          name: h.name,
          category: h.category,
          tags: h.tags,
        })),
    [hobitCatalog],
  );

  const reset = () => {
    setStep(0);
    setUrl("");
    setUrlError(false);
    setConnectionId(NO_CONNECTION);
    setTools(new Set());
    setHobits(new Set());
  };

  const next = () => {
    if (step === 0) {
      // A git URL (https / git@) OR an absolute local path (/…, ~/…, or C:\…).
      const ok = /^https?:\/\/|^git@|^~?\/|^[A-Za-z]:[\\/]/.test(url.trim());
      if (!ok) {
        setUrlError(true);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = () => {
    ingest(
      {
        url: url.trim(),
        connectionId: connectionId !== NO_CONNECTION ? connectionId : null,
        toolIds: [...tools],
      },
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
            setOpen(false);
            reset();
            return;
          }
          // Assign the chosen hobits (they don't run during ingest).
          if (hobits.size > 0) {
            setRepoHobits.mutate({ id: repo.id, slugs: [...hobits] });
          }
          toast.success(
            t("repositories.ingest.toast_added", { slug: repo.slug }),
            {
              description: t("repositories.ingest.toast_added_desc"),
            },
          );
          setOpen(false);
          reset();
          navigate({
            to: "/repositories/$id",
            params: { id: repo.id },
            search: { tab: "overview" },
          });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isPending) return; // lock during the blocking ingest
        setOpen(o);
        if (!o) reset();
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("repositories.wizard.title")}</DialogTitle>
          <DialogDescription>
            {t(`repositories.wizard.step_${STEPS[step]}_desc`)}
          </DialogDescription>
        </DialogHeader>

        <StepDots steps={STEPS} active={step} />

        <div className="min-h-[16rem] py-2">
          {isPending ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {t("repositories.wizard.analyzing")}
            </p>
          ) : step === 0 ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-url">
                  {t("repositories.ingest.url.label")}
                </Label>
                <Input
                  id="wiz-url"
                  type="text"
                  autoFocus
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlError(false);
                  }}
                  placeholder={t("repositories.ingest.placeholder")}
                  aria-invalid={urlError}
                />
                {urlError ? (
                  <p className="text-xs text-destructive">
                    {t("repositories.ingest.url.invalid")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>{t("repositories.ingest.connection.label")}</Label>
                <Select
                  value={connectionId}
                  onValueChange={(v) => setConnectionId(v ?? NO_CONNECTION)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(value) =>
                        value === NO_CONNECTION
                          ? t("repositories.ingest.connection.none")
                          : ((connections?.items ?? []).find(
                              (c) => c.id === value,
                            )?.name ?? String(value))
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CONNECTION}>
                      {t("repositories.ingest.connection.none")}
                    </SelectItem>
                    {(connections?.items ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : step === 1 ? (
            <ToolPicker
              tools={toolCatalog ?? []}
              selected={tools}
              onToggle={(v) => setTools((s) => toggle(s, v))}
              emptyLabel={t("repositories.wizard.tools_empty")}
            />
          ) : step === 2 ? (
            <HobitMultiSelect
              hobits={hobitOptions}
              selected={hobits}
              onToggle={(v) => setHobits((s) => toggle(s, v))}
              emptyLabel={t("repositories.wizard.hobits_empty")}
            />
          ) : (
            <dl className="space-y-3 text-sm">
              <Summary
                label={t("repositories.wizard.sum_url")}
                value={url}
                mono
              />
              <Summary
                label={t("repositories.wizard.sum_tools")}
                value={
                  tools.size
                    ? t("repositories.wizard.count_selected", {
                        count: tools.size,
                      })
                    : t("repositories.wizard.none")
                }
              />
              <Summary
                label={t("repositories.wizard.sum_hobits")}
                value={
                  hobits.size ? (
                    <div className="flex flex-wrap gap-1">
                      {[...hobits].map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    t("repositories.wizard.none")
                  )
                }
              />
            </dl>
          )}
        </div>

        <DialogFooter>
          {step > 0 && !isPending ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              {t("repositories.wizard.back")}
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>{t("repositories.wizard.next")}</Button>
          ) : (
            <Button onClick={finish} disabled={isPending}>
              {isPending
                ? t("repositories.ingest.submitting")
                : t("repositories.wizard.finish")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepDots({
  steps,
  active,
}: {
  steps: readonly string[];
  active: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((name, i) => (
        <span
          key={name}
          className={`h-1.5 flex-1 rounded-full ${
            i <= active ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function Summary({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "break-all font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}
