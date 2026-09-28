// The backup file (Settings → Резервна копія).
//   version 2: { "version": 2, "links": { key: url }, "stats": { "joins": [ … ] } }
//   version 1: the plain links object, as exported before stats existed. Still accepted.

import { sanitizeLinks, exportJson } from "./links.js";
import { sanitizeJoins } from "./stats.js";

export const BACKUP_VERSION = 2;

export function buildBackup(links, joins) {
  const sortedLinks = JSON.parse(exportJson(links)); // same stable key order as before
  return `${JSON.stringify({ version: BACKUP_VERSION, links: sortedLinks, stats: { joins } }, null, 2)}\n`;
}

// -> { links, joins }. Throws if it isn't one of our files or has nothing usable.
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("backup: not an object");

  let links;
  let joins = [];
  if (typeof data.version === "number") {
    links = sanitizeLinks(data.links);
    joins = sanitizeJoins(data.stats?.joins);
  } else {
    links = sanitizeLinks(data); // version 1: links only
  }
  if (Object.keys(links).length === 0 && joins.length === 0) throw new Error("backup: nothing to import");
  return { links, joins };
}
