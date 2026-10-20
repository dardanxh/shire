import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Bookmark } from "../api";

/**
 * The bookmark's site icon, or a coloured monogram when there is none (or the
 * image fails to load). The monogram colour is per-bookmark data, so it is the
 * one inline style here — it can't be a theme token.
 */
export function BookmarkLogo({
  bookmark,
  className,
}: {
  bookmark: Pick<Bookmark, "name" | "logo_url" | "logo_color">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const base = cn(
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg",
    className,
  );

  if (bookmark.logo_url && !failed) {
    return (
      <span className={cn(base, "border bg-background p-1.5")}>
        <img
          src={bookmark.logo_url}
          alt=""
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "font-semibold text-white",
        !bookmark.logo_color && "bg-muted-foreground",
      )}
      style={
        bookmark.logo_color
          ? { backgroundColor: bookmark.logo_color }
          : undefined
      }
      aria-hidden
    >
      {bookmark.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
