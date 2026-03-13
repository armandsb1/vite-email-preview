export const DEFAULT_REGION = "mypurecloud.ie";
export const APP_NAME = "my_app_name";

export const SLA_THRESHOLD_KEY = "sla_threshold_days";

export function getSlaThresholdMs(): number {
  const stored = localStorage.getItem(SLA_THRESHOLD_KEY);
  const days = stored ? parseInt(stored, 10) : 7;
  return days * 24 * 60 * 60 * 1000;
}

export const ACTIVE_EMAIL_LOOKBACK_WINDOWS = [
  { startDaysAgo: 30, endDaysAgo: 0 },
  { startDaysAgo: 60, endDaysAgo: 30 },
  { startDaysAgo: 90, endDaysAgo: 60 },
] as const;

export const PAGE_SIZE = 50;
export const USERS_PAGE_SIZE = 500;
export const QUEUES_PAGE_SIZE = 500;

// Queue names containing these substrings appear in the queue filter dropdown
export const EMAIL_QUEUE_FILTER_KEYWORDS = ["email", "ootel", "test"];
