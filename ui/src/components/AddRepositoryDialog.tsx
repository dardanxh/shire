"use client";

import { useState } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
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
import { addRepository, ApiError, type RepositoryOut } from "@/lib/api";

export function AddRepositoryDialog({
  onAdded,
}: {
  onAdded?: (repo: RepositoryOut) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const repo = await addRepository(trimmed);
      if (repo.status === "failed") {
        toast.error(`Analysis failed for ${repo.slug}`, {
          description: repo.error ?? "The repository could not be analyzed.",
        });
      } else {
        toast.success(`Added ${repo.slug}`, {
          description: "Repository cloned and analyzed.",
        });
      }
      onAdded?.(repo);
      setUrl("");
      setOpen(false);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      toast.error("Could not add repository", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Prevent closing while a blocking request is in flight.
        if (submitting) return;
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon className="size-4" />
            Add repository
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a repository</DialogTitle>
            <DialogDescription>
              Paste a git URL. Hobits clones and analyzes it — this can take a
              few seconds.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input
              autoFocus
              type="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              disabled={submitting}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting || !url.trim()}>
              {submitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                "Add & analyze"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
