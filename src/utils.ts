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

/** Formats a remaining-time duration in ms as "Xd Yh Zm". Hours/minutes omitted when 0. */
export function formatRemainingTime(ms: number): string {
  const absMs = Math.abs(ms);
  const totalMinutes = Math.floor(absMs / 60000);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const days = Math.floor(totalMinutes / 60 / 24);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length ? parts.join(" ") : "0m";
}

const STARRED_QUEUES_KEY = "starred_queues";

export function getStarredQueues(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STARRED_QUEUES_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function setStarredQueue(name: string, starred: boolean): void {
  const set = getStarredQueues();
  if (starred) set.add(name); else set.delete(name);
  localStorage.setItem(STARRED_QUEUES_KEY, JSON.stringify([...set]));
}

export function formatDateRange(monthsBack: number): string {
  const today = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - monthsBack);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(from)}/${fmt(today)}`;
}
