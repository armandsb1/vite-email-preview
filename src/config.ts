export const DEFAULT_REGION = "mypurecloud.ie";
export const APP_NAME = "email_app";

export const SLA_THRESHOLD_KEY = "sla_threshold_days";

// Returns the SLA threshold in milliseconds, defaulting to 7 days if not set by the user
export function getSlaThresholdMs(): number {
  const stored = localStorage.getItem(SLA_THRESHOLD_KEY);
  const days = stored ? parseInt(stored, 10) : 7;
  return days * 24 * 60 * 60 * 1000;
}

// Time windows used to fetch active emails. Each window is a non-overlapping date range (in days ago).
// The first window (0–7 days) is always loaded; subsequent windows are loaded on demand via
// "Load older emails" or auto-expanded when a window returns fewer than AUTO_EXPAND_EMAIL_THRESHOLD results.
export const ACTIVE_EMAIL_LOOKBACK_WINDOWS = [
  { startDaysAgo: 5, endDaysAgo: 0 },
  { startDaysAgo: 15, endDaysAgo: 5 },
  { startDaysAgo: 30, endDaysAgo: 15 },
  { startDaysAgo: 60, endDaysAgo: 30 },
  { startDaysAgo: 90, endDaysAgo: 60 },
] as const;

export const MAX_LOOKBACK_WINDOWS = ACTIVE_EMAIL_LOOKBACK_WINDOWS.length;

// If a 30-day window returns at most this many emails, the next window is loaded automatically
export const AUTO_EXPAND_EMAIL_THRESHOLD = 500;

// PAGE_SIZE: max rows per API request to the conversations detail query
// TABLE_PAGE_SIZE: rows per page in the UI table
export const PAGE_SIZE = 50;
export const TABLE_PAGE_SIZE = 100;
export const USERS_PAGE_SIZE = 500;
export const QUEUES_PAGE_SIZE = 500;

// Name of the JSON schema property whose _enumProperties populate the processing state dropdown.
// The schema is fetched once via getConversationCustomattributesSchemas and its ID is cached
// in processingStatusSchemaId for subsequent PUT calls.
export const EMAIL_STATUS_ATTRIBUTE_NAME = "processingStatusList";

// Custom attribute key that stores the target SLA deadline (ISO date string) for an email conversation
export const EMAIL_TARGET_SLA_ATTRIBUTE_NAME = "targetSla";

// Queue names containing these substrings appear in the queue filter dropdown
export const EMAIL_QUEUE_FILTER_KEYWORDS = ["email", "ootel", "test"];
export const EMAIL_QUEUE_FILTER_ORGS = ["3b3b5182-a866-4ba5-bbe7-a28894787f92"];

// Org IDs that are allowed to see the "Retrieve data for selected queue only" segment-filter checkbox.
// The checkbox restricts the analytics query to only conversations that passed through the chosen queue.
export const EMAIL_FILTER_CHECKBOX_ORGS = ["0b64ef26-3681-4cbf-9675-9154ddc0456a","5ca51e92-6576-497f-a70c-c67af4550fb2","b1ef458e-9f3d-433b-89c4-eaa0931acf23"]
