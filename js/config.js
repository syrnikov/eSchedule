// Deployment settings. Change these, not the code.

// Cloudflare Worker that proxies the air alarm feed (see worker/).
// Empty = not deployed yet: the alarm state stays "unknown".
export const ALARM_WORKER_URL = "https://pary-alarm.noxtrnall.workers.dev";

// Same Worker also takes push subscriptions (/push/*) and sends the reminders.
export const PUSH_WORKER_URL = ALARM_WORKER_URL;

// Key in the feed's "states" object (a data key, not UI text).
export const ALARM_REGION = "Одеська область";
