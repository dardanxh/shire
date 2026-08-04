import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useConnectionsQuery } from "@/features/connectors/api";
import { useHobitsQuery } from "@/features/hobits/api";
import { useToolsQuery } from "@/features/tools/api";
import type { RepositoryOut } from "@/lib/api";
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

/**
 * Split typed/pasted text into subdirectory entries — comma or newline
 * separated, slashes trimmed off the ends so `/packages/ui/` == `packages/ui`.
 */
function parseSubpaths(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

export function IngestRepositoryDialog({
  open: controlledOpen,
  onOpenChange,
}: {
  /** Optionally controlled (the Home checklist deep-links via a `wizard` URL param). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  // One repository record is created per subdirectory; empty = the whole repo.
  const [subpaths, setSubpaths] = useState<string[]>([]);
  const [subpathDraft, setSubpathDraft] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [connectionId, setConnectionId] = useState(NO_CONNECTION);
  const [tools, setTools] = useState<Set<string>>(new Set());
  const [hobits, setHobits] = useState<Set<string>>(new Set());
  // Set while the ingest loop runs — doubles as the "submitting" flag and feeds
  // the "n of m" progress line when several subdirectories are being added.
  const [progress, setProgress] = useState<{ done: number; total: number }>();

  const { data: connections } = useConnectionsQuery({
    page: 1,
    page_size: 100,
  });
  const { data: toolCatalog } = useToolsQuery();
  const { data: hobitCatalog } = useHobitsQuery();
  const { mutateAsync: ingest } = useIngestRepositoryMutation();
  const setRepoHobits = useSetRepoHobitsMutation();
  const isPending = progress !== undefined;

  const hobitOptions = useMemo(
    () =>
      (hobitCatalog ?? [])
        // repo-onboarding runs for every repo; it isn't part of the assignable roster.
        .filter((h) => h.slug !== "repo-onboarding")
        .map((h) => ({
          slug: h.slug,
          name: h.name,
          tags: h.tags,
        })),
    [hobitCatalog],
  );

  const reset = () => {
    setStep(0);
    setUrl("");
    setSubpaths([]);
    setSubpathDraft("");
    setUrlError(false);
    setConnectionId(NO_CONNECTION);
    setTools(new Set());
    setHobits(new Set());
    setProgress(undefined);
  };

  /** Move whatever is typed in the subdirectory box into the entry list. */
  const commitDraft = (raw = subpathDraft) => {
    const parsed = parseSubpaths(raw);
    if (parsed.length > 0) {
      setSubpaths((prev) => [...new Set([...prev, ...parsed])]);
    }
    setSubpathDraft("");
    return parsed;
  };

  const next = () => {
    if (step === 0) {
      // A git URL (https / git@) OR an absolute local path (/…, ~/…, or C:\…).
      const ok = /^https?:\/\/|^git@|^~?\/|^[A-Za-z]:[\\/]/.test(url.trim());
      if (!ok) {
        setUrlError(true);
        return;
      }
      // Don't silently drop a subdirectory the user typed but never added.
      commitDraft();
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const finish = async () => {
    // No subdirectory = the repository as a whole; otherwise one record each.
    const targets: (string | null)[] = subpaths.length > 0 ? subpaths : [null];
    setProgress({ done: 0, total: targets.length });
    const created: RepositoryOut[] = [];
    const failed: string[] = [];

    // Sequential chain on purpose: every target clones the same remote, so
    // firing them in parallel would race on one working copy.
    for (const target of targets) {
      try {
        const repo = await ingest({
          url: url.trim(),
          subpath: target,
          connectionId: connectionId !== NO_CONNECTION ? connectionId : null,
          toolIds: [...tools],
        });
        if (repo.status === "failed") {
          failed.push(target ?? repo.slug);
          if (targets.length === 1) {
            toast.error(
              t("repositories.ingest.toast_failed", { slug: repo.slug }),
              {
                description:
                  repo.error ?? t("repositories.ingest.toast_failed_desc"),
              },
            );
          }
        } else {
          created.push(repo);
          // Assign the chosen hobits (they don't run during ingest).
          if (hobits.size > 0) {
            setRepoHobits.mutate({ id: repo.id, slugs: [...hobits] });
          }
        }
      } catch {
        // Request-level failures are already toasted by the global handler;
        // keep going so one bad subdirectory doesn't sink the others.
        failed.push(target ?? url.trim());
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    setOpen(false);
    reset();

    if (created.length === 0) return;

    if (created.length === 1 && failed.length === 0) {
      const repo = created[0];
      toast.success(t("repositories.ingest.toast_added", { slug: repo.slug }), {
        description: t("repositories.ingest.toast_added_desc"),
      });
      navigate({
        to: "/repositories/$id",
        params: { id: repo.id },
        search: { tab: "overview" },
      });
      return;
    }

    toast.success(
      t("repositories.ingest.toast_added_many", { count: created.length }),
      {
        description:
          failed.length > 0
            ? t("repositories.ingest.toast_partial_desc", {
                paths: failed.join(", "),
              })
            : t("repositories.ingest.toast_added_desc"),
      },
    );
    navigate({
      to: "/repositories",
      search: { view: "repositories", page: 1, size: 20 },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isPending) return; // lock while the registration request is in flight
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
              {progress && progress.total > 1
                ? t("repositories.wizard.analyzing_many", {
                    done: Math.min(progress.done + 1, progress.total),
                    total: progress.total,
                  })
                : t("repositories.wizard.analyzing")}
            </p>
          ) : step === 0 ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-url" required>
                  {t("repositories.ingest.url.label")}
                </Label>
                <Input
                  id="wiz-url"
                  type="text"
                  autoFocus
                  required
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
                <Label htmlFor="wiz-subpath">
                  {t("repositories.ingest.subpath.label")}
                </Label>
                {/* A textarea, not an input: pasting a one-path-per-line list into a
                    single-line input collapses the newlines to spaces, which parses as one
                    bogus path. Enter therefore inserts a newline; the draft is committed by
                    Add, by blurring, or by advancing the wizard. */}
                <div className="flex items-start gap-2">
                  <Textarea
                    id="wiz-subpath"
                    rows={3}
                    value={subpathDraft}
                    onChange={(e) => setSubpathDraft(e.target.value)}
                    onBlur={() => commitDraft()}
                    placeholder={t("repositories.ingest.subpath.placeholder")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={parseSubpaths(subpathDraft).length === 0}
                    onClick={() => commitDraft()}
                  >
                    {t("repositories.ingest.subpath.add")}
                  </Button>
                </div>
                {subpaths.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {subpaths.map((path) => (
                      <Badge
                        key={path}
                        variant="secondary"
                        className="gap-1 font-mono text-xs"
                      >
                        {path}
                        <button
                          type="button"
                          aria-label={t("repositories.ingest.subpath.remove", {
                            path,
                          })}
                          onClick={() =>
                            setSubpaths((prev) =>
                              prev.filter((p) => p !== path),
                            )
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {t("repositories.ingest.subpath.hint")}
                </p>
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
              {subpaths.length > 0 ? (
                <Summary
                  label={t("repositories.wizard.sum_subpath")}
                  value={
                    <div className="flex flex-wrap gap-1">
                      {subpaths.map((path) => (
                        <Badge
                          key={path}
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {path}
                        </Badge>
                      ))}
                    </div>
                  }
                />
              ) : null}
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
            <Button onClick={() => void finish()} disabled={isPending}>
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
