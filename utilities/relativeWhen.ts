// Adapted from 5Stack WEB bd6c8150 (components/play/scheduleRow.ts); MIT
// Copyright (c) 2025 5Stack.gg; see LICENSE.
type Translate = (key: string, params?: Record<string, unknown>) => string;

// "in 15 min", "in 2 h", "tomorrow", "in 3 days" -- empty once it's started.
export function relativeWhen(at: Date, now: Date, t: Translate): string {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "";
  if (minutes < 60)
    return t("pages.play.schedule.in_minutes", { count: minutes });
  if (at.toDateString() === now.toDateString()) {
    return t("pages.play.schedule.in_hours", {
      count: Math.round(minutes / 60),
    });
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (at.toDateString() === tomorrow.toDateString()) {
    return t("pages.play.schedule.tomorrow");
  }
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((at.getTime() - midnight.getTime()) / 86_400_000);
  return t("pages.play.schedule.in_days", { count: days });
}
