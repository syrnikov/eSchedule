// Deployment settings. Change these, not the code.

// Cloudflare Worker that proxies the air alarm feed (see worker/).
// Empty = not deployed yet: the alarm state stays "unknown".
export const ALARM_WORKER_URL = "https://pary-alarm.noxtrnall.workers.dev";

// Key in the feed's "states" object (a data key, not UI text).
export const ALARM_REGION = "Одеська область";
