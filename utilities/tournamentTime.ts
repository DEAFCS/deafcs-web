export type TournamentTimeInput = string | number | Date | null | undefined;

export const COPENHAGEN_TIME_ZONE = "Europe/Copenhagen";

function parseTime(value: TournamentTimeInput): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function zoneOptions(timeZone?: string): { timeZone?: string } {
  return timeZone ? { timeZone } : {};
}

function dateKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    ...zoneOptions(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDateTime(
  date: Date,
  locale?: Intl.LocalesArgument,
  timeZone?: string,
  includeYear = false,
): string {
  const dateLabel = new Intl.DateTimeFormat(locale, {
    ...zoneOptions(timeZone),
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    ...zoneOptions(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return `${dateLabel} ${timeLabel}`;
}

export function formatLocalTournamentDateTime(
  value: TournamentTimeInput,
  locale?: Intl.LocalesArgument,
  localTimeZone?: string,
): string {
  const date = parseTime(value);
  return date ? formatDateTime(date, locale, localTimeZone) : "";
}

export function formatLocalTournamentClock(
  value: TournamentTimeInput,
  locale?: Intl.LocalesArgument,
  localTimeZone?: string,
): string {
  const date = parseTime(value);
  if (!date) return "";

  return new Intl.DateTimeFormat(locale, {
    ...zoneOptions(localTimeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function copenhagenZoneName(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: COPENHAGEN_TIME_ZONE,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "CET"
  );
}

export function formatCopenhagenTournamentTime(
  value: TournamentTimeInput,
  locale?: Intl.LocalesArgument,
  localTimeZone?: string,
): string {
  const date = parseTime(value);
  if (!date) return "";

  const resolvedLocalZone =
    localTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const crossesLocalDate =
    dateKey(date, resolvedLocalZone) !== dateKey(date, COPENHAGEN_TIME_ZONE);
  const label = formatDateTime(
    date,
    locale,
    COPENHAGEN_TIME_ZONE,
    crossesLocalDate,
  );

  return `${label} ${copenhagenZoneName(date)}`;
}

export function localTimeZoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
}
