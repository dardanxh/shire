import { describe, expect, it } from "vitest";

import {
  completionToneClass,
  inspectionLabel,
} from "@/features/repositories/inspections";

describe("completionToneClass", () => {
  it("greens only near completion, ambers the middle, reds a bare start", () => {
    expect(completionToneClass(30, 30)).toBe("text-success");
    expect(completionToneClass(24, 30)).toBe("text-success");
    expect(completionToneClass(23, 30)).toBe("text-warning");
    expect(completionToneClass(12, 30)).toBe("text-warning");
    expect(completionToneClass(11, 30)).toBe("text-destructive");
    expect(completionToneClass(0, 30)).toBe("text-destructive");
  });

  it("stays neutral when there is nothing to complete", () => {
    expect(completionToneClass(0, 0)).toBe("text-muted-foreground");
  });
});

describe("inspectionLabel", () => {
  // Integrations are named after the binary they run — product names, not copy.
  it("renders a tool's id verbatim", () => {
    const t = () => "should not be called";
    expect(inspectionLabel("tool:gitleaks", t)).toBe("gitleaks");
    expect(inspectionLabel("tool:osv-scanner", t)).toBe("osv-scanner");
  });

  it("translates everything else, never emitting a colon into the i18n key", () => {
    const seen: string[] = [];
    const t = (key: string) => {
      seen.push(key);
      return key;
    };

    inspectionLabel("architecture:module-deps", t);
    inspectionLabel("codebase-overview", t);

    // A colon would be read as i18next's namespace separator and resolve the wrong key.
    expect(seen.every((key) => !key.includes(":"))).toBe(true);
    expect(seen[0]).toBe(
      "repositories.view.actions.items.architecture_module-deps",
    );
    expect(seen[1]).toBe("repositories.view.actions.items.codebase-overview");
  });
});
