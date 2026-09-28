// Tiny DOM helpers shared by the main screen and settings.

// el("p", { class: "x" }, "text", childNode). Skips null/false/"" children and attrs.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false && c !== ""));
  return node;
}

// Decorative Material Symbols icon. size: "" (24px), "20" or "40".
export const icon = (name, size = "") =>
  el("span", { class: `icon ${size ? `icon--${size}` : ""}`.trim(), "aria-hidden": "true" }, name);
