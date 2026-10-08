// The backup file (Settings → Резервна копія).
//   version 3: { "version": 3, "links": { key: url }, "stats": { "joins": [ … ] },
//                "contacts": { "@teacher": email }, "tasks": [ … ] }
//   version 2: the same without contacts and tasks. Still accepted.
//   version 1: the plain links object, as exported before stats existed. Still accepted.

import { sanitizeLinks, exportJson } from "./links.js";
import { sanitizeJoins } from "./stats.js";
import { sanitizeContacts } from "./contacts.js";
import { sanitizeTasks } from "./tasks.js";

export const BACKUP_VERSION = 3;

const sortedKeys = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, "uk")));

export function buildBackup(links, joins, { contacts = {}, tasks = [] } = {}) {
  const sortedLinks = JSON.parse(exportJson(links)); // same stable key order as before
  return `${JSON.stringify({
    version: BACKUP_VERSION, links: sortedLinks, stats: { joins }, contacts: sortedKeys(contacts), tasks,
  }, null, 2)}\n`;
}

// -> { links, joins, contacts, tasks }. Throws if it isn't one of our files or has nothing usable.
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("backup: not an object");

  let links;
  let joins = [];
  let contacts = {};
  let tasks = [];
  if (typeof data.version === "number") {
    links = sanitizeLinks(data.links);
    joins = sanitizeJoins(data.stats?.joins);
    contacts = sanitizeContacts(data.contacts);
    tasks = sanitizeTasks(data.tasks);
  } else {
    links = sanitizeLinks(data); // version 1: links only
  }
  const empty = Object.keys(links).length === 0 && joins.length === 0 &&
    Object.keys(contacts).length === 0 && tasks.length === 0;
  if (empty) throw new Error("backup: nothing to import");
  return { links, joins, contacts, tasks };
}
