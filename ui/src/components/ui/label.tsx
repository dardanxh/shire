import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is supplied by FormLabel/consumers.
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm font-medium leading-none select-none group-data-[disabled=true]/field:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
