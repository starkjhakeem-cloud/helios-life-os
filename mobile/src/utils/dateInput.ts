const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function formatDateTimeInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_TIME_FORMAT.format(date).replace(",", " •");
}

export function formatDateInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_FORMAT.format(date);
}

export function parseDateTimeInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  const currentYear = new Date().getFullYear();
  const withYear = new Date(`${trimmed} ${currentYear}`);
  if (!Number.isNaN(withYear.getTime())) return withYear;

  return null;
}

export function parseDateInput(value: string): Date | null {
  const parsed = parseDateTimeInput(value);
  if (!parsed) return null;
  parsed.setHours(23, 59, 0, 0);
  return parsed;
}

export function formatBackendDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
