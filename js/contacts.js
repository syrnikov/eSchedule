// Teachers' email addresses, stored only in this browser's localStorage.
// Keys are the same "@teacher" keys as links (links.js teacherKey), values are addresses.

export const STORAGE_KEY = "pary.contacts.v1";
const MAX_EMAIL_LENGTH = 254;
const MAX_KEY_LENGTH = 300;

// --- Pure helpers (tested) ---

// Deliberately simple: one @, a dot in the domain, and nothing that could break out of a
// mailto: address (no spaces, quotes, brackets, ? & # or commas).
const EMAIL = /^[^\s@<>"'(),;:?&#\\]+@[^\s@<>"'(),;:?&#\\]+\.[^\s@<>"'(),;:?&#\\.]{2,}$/;

export function isValidEmail(value) {
  return typeof value === "string" && value.length <= MAX_EMAIL_LENGTH && EMAIL.test(value);
}

export const isTeacherKey = (key) =>
  typeof key === "string" && key.length > 1 && key.length <= MAX_KEY_LENGTH && key.startsWith("@") && key === key.trim();

// Keeps only "@teacher -> valid email" pairs. Used for storage reads, imports and shares.
export function sanitizeContacts(data) {
  const out = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [key, email] of Object.entries(data)) {
    const value = typeof email === "string" ? email.trim() : "";
    if (isTeacherKey(key) && isValidEmail(value)) out[key] = value;
  }
  return out;
}

// mailto: with the subject and body filled in. The address is already safe (isValidEmail);
// the rest is percent-encoded, so Cyrillic and new lines survive every mail app.
export function mailtoUrl(email, { subject = "", body = "" } = {}) {
  const query = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body)}`,
  ].filter(Boolean).join("&");
  return `mailto:${email}${query ? `?${query}` : ""}`;
}

// Sets one address; empty value removes it. Returns the new contacts object.
export function setContact(contacts, key, email) {
  const next = { ...contacts };
  if (email) next[key] = email;
  else delete next[key];
  return next;
}

// --- Storage ---

export function loadContacts() {
  try {
    return sanitizeContacts(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

// Returns false if storage is unavailable (e.g. blocked), so the UI can say so.
export function saveContacts(contacts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeContacts(contacts)));
    return true;
  } catch {
    return false;
  }
}
