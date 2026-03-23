export const DEFAULT_REGION = "mypurecloud.ie";
export const APP_NAME = "email_app";

export const SLA_THRESHOLD_KEY = "sla_threshold_days";

export function getSlaThresholdMs(): number {
  const stored = localStorage.getItem(SLA_THRESHOLD_KEY);
  const days = stored ? parseInt(stored, 10) : 7;
  return days * 24 * 60 * 60 * 1000;
}

export const ACTIVE_EMAIL_LOOKBACK_WINDOWS = [
  { startDaysAgo: 15, endDaysAgo: 0 },
  { startDaysAgo: 30, endDaysAgo: 15 },
  { startDaysAgo: 60, endDaysAgo: 30 },
  { startDaysAgo: 90, endDaysAgo: 60 },
] as const;

export const MAX_LOOKBACK_WINDOWS = ACTIVE_EMAIL_LOOKBACK_WINDOWS.length;

// If a 30-day window returns at most this many emails, the next window is loaded automatically
export const AUTO_EXPAND_EMAIL_THRESHOLD = 500;

export const PAGE_SIZE = 50;
export const TABLE_PAGE_SIZE = 250;
export const USERS_PAGE_SIZE = 500;
export const QUEUES_PAGE_SIZE = 500;

// Custom attribute property name whose _enumProperties populate the state filter dropdown
export const EMAIL_STATUS_ATTRIBUTE_NAME = "processingStatusList";

// Queue names containing these substrings appear in the queue filter dropdown
export const EMAIL_QUEUE_FILTER_KEYWORDS = ["email", "ootel", "test"];
export const EMAIL_QUEUE_FILTER_ORGS = ["3b3b5182-a866-4ba5-bbe7-a28894787f92"];
export const EMAIL_FILTER_CHECKBOX_ORGS = ["0b64ef26-3681-4cbf-9675-9154ddc0456a","5ca51e92-6576-497f-a70c-c67af4550fb2"]