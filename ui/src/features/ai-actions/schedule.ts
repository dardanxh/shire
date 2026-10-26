import type { TFunction } from "i18next";

import { SCHEDULE_PRESETS } from "./schemas";

/** A schedule string in words: presets by name, `every:`/`cron:` spelled out. */
export function describeSchedule(schedule: string, t: TFunction): string {
  if ((SCHEDULE_PRESETS as readonly string[]).includes(schedule)) {
    return t(`ai_actions.schedule.${schedule}`);
  }
  const every = /^every:(\d+)([mh])$/.exec(schedule);
  if (every) {
    return t(
      every[2] === "h"
        ? "ai_actions.schedule.every_hours"
        : "ai_actions.schedule.every_minutes",
      { count: Number(every[1]) },
    );
  }
  if (schedule.startsWith("cron:")) {
    return t("ai_actions.schedule.cron", { expr: schedule.slice(5) });
  }
  return schedule;
}
