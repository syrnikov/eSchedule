-- Push subscriptions. One row per browser (keyed by the push endpoint).
-- No names, no meeting links: just where to send, which group, and what the student wants.
CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint      TEXT PRIMARY KEY,
  p256dh        TEXT NOT NULL,              -- browser's public key, needed to encrypt
  auth          TEXT NOT NULL,              -- browser's auth secret, needed to encrypt
  grp           TEXT NOT NULL,              -- "group|subgroup", as in data/schedule.json
  reminders     INTEGER NOT NULL DEFAULT 1, -- 0/1
  lead          INTEGER NOT NULL DEFAULT 5, -- minutes before class: 5, 10 or 15
  alerts        INTEGER NOT NULL DEFAULT 0, -- 0/1: air alert start/end during a class
  last_reminder TEXT,                       -- "2026-09-28 08:15" of the last class reminded (dedupe)
  last_alert    TEXT,                       -- key of the last alert event sent (dedupe)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS subscriptions_by_group ON subscriptions (grp);
