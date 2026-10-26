import { describe, expect, it } from "vitest";

import { joinSchedule, splitSchedule } from "./schemas";

describe("schedule round-trip", () => {
  it("keeps presets as presets", () => {
    expect(splitSchedule("weekdays")).toEqual({
      schedulePreset: "weekdays",
      customSchedule: "",
    });
  });

  it("moves anything else into the custom field", () => {
    const split = splitSchedule("cron:30 8 * * 1-5");
    expect(split.schedulePreset).toBe("custom");
    expect(joinSchedule(split)).toBe("cron:30 8 * * 1-5");
  });

  it("trims a custom schedule", () => {
    expect(
      joinSchedule({ schedulePreset: "custom", customSchedule: " every:2h " }),
    ).toBe("every:2h");
  });
});
