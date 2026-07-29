import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("resolves conflicting tailwind utilities in favor of the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm text-muted-foreground", "text-destructive")).toBe(
      "text-sm text-destructive",
    );
  });

  it("keeps non-conflicting utilities and drops falsy inputs", () => {
    expect(cn("flex", undefined, false, "gap-2")).toBe("flex gap-2");
  });

  it("supports clsx conditional objects", () => {
    expect(cn("p-0", { "border-destructive/40": true, hidden: false })).toBe(
      "p-0 border-destructive/40",
    );
  });
});
