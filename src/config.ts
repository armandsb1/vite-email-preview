export const DEFAULT_REGION = "mypurecloud.ie";
export const APP_NAME = "email_app";

export const SLA_THRESHOLD_KEY = "sla_threshold_days";

export function getSlaThresholdMs(): number {
  const stored = localStorage.getItem(SLA_THRESHOLD_KEY);
  const days = stored ? parseInt(stored, 10) : 7;
  return days * 24 * 60 * 60 * 1000;
}

export const ACTIVE_EMAIL_LOOKBACK_WINDOWS = [
  { startDaysAgo: 20, endDaysAgo: 0 },
  { startDaysAgo: 40, endDaysAgo: 20 },
  { startDaysAgo: 70, endDaysAgo: 40 },
] as const;

export const MAX_LOOKBACK_WINDOWS = ACTIVE_EMAIL_LOOKBACK_WINDOWS.length;

// If a 30-day window returns at most this many emails, the next window is loaded automatically
export const AUTO_EXPAND_EMAIL_THRESHOLD = 500;

export const PAGE_SIZE = 50;
export const TABLE_PAGE_SIZE = 250;
export const USERS_PAGE_SIZE = 500;
export const QUEUES_PAGE_SIZE = 500;

// Queue names containing these substrings appear in the queue filter dropdown
export const EMAIL_QUEUE_FILTER_KEYWORDS = ["email", "ootel", "test"];
export const EMAIL_QUEUE_FILTER_ORGS = ["3b3b5182-a866-4ba5-bbe7-a28894787f92"];