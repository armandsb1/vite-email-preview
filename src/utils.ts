export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function convertToDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return { days, hours, minutes };
}

export function formatShortDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Returns the column index for a given data-column-name in #sortable-table, or -1 if not found. */
export function getColumnIndex(columnName: string): number {
  const headers = document.querySelectorAll("#sortable-table thead th");
  return Array.from(headers).findIndex(
    (h) => h.getAttribute("data-column-name") === columnName,
  );
}

/** Reads a URL search param; persists it to sessionStorage if present, otherwise falls back to sessionStorage. */
export function getSessionParam(
  params: URLSearchParams,
  key: string,
): string | null {
  const val = params.get(key);
  if (val) {
    sessionStorage.setItem(key, val);
    return val;
  }
  return sessionStorage.getItem(key);
}

export function getUTCOffset(): string {
  const offsetMinutes = new Date().getTimezoneOffset();
  const offsetHours = -offsetMinutes / 60;
  if (offsetHours === 0) return "+00:00";

  const sign = offsetHours > 0 ? "+" : "-";
  const absHours = Math.abs(Math.floor(offsetHours));
  const minutes = Math.abs(Math.floor((offsetHours - absHours) * 60));
  return `${sign}${String(absHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatDateRange(monthsBack: number): string {
  const today = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(from)}/${fmt(today)}`;
}
