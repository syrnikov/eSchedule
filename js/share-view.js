// Opening a "#share=…" link: show what would be added, let the student choose, save nothing
// until they confirm. Entries that would replace one of their own links start unticked.

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { decodeShare, diffShare } from "./share.js";
import { loadLinks, saveLinks } from "./links.js";
import { pluralize, keepName } from "./format.js";

const T = STRINGS.shareImport;

// onDone(): back to the main screen.
export async function renderShareImport(container, fragment, onDone) {
  const heading = el("h1", { class: "share-title", tabindex: "-1" }, T.title);
  const back = () => el("button", { type: "button", class: "btn btn--primary" }, T.back);

  // A message and a way out (broken link, nothing new, done).
  const finish = (text, kind = "") => {
    const btn = back();
    btn.addEventListener("click", onDone);
    container.replaceChildren(el("section", { class: "card share" },
      heading, el("p", { class: `share-intro${kind ? ` is-${kind}` : ""}` }, text),
      el("div", { class: "share-actions" }, btn)));
    heading.focus({ preventScroll: true });
  };

  let entries;
  try {
    entries = diffShare(await decodeShare(fragment), loadLinks());
  } catch (err) {
    console.warn(err);
    return finish(err.code === "unsupported" ? T.tooOld : T.broken, "error");
  }
  if (entries.every((e) => e.status === "same")) return finish(T.nothingNew);

  const addBtn = el("button", { type: "button", class: "btn btn--primary" });
  const cancelBtn = el("button", { type: "button", class: "btn btn--text" }, T.cancel);
  const boxes = [];

  const items = entries.map((e, i) => {
    const id = `share-${i}`;
    const box = el("input", { type: "checkbox", id, class: "share-check" });
    box.checked = e.status === "new";
    box.disabled = e.status === "same";
    boxes.push({ box, entry: e });

    const badge = {
      new: el("span", { class: "share-badge share-badge--new" }, T.isNew),
      replace: el("span", { class: "share-badge share-badge--replace" }, T.replaces),
      same: el("span", { class: "share-badge" }, T.same),
    }[e.status];

    return el("li", { class: `share-item is-${e.status}` },
      el("label", { for: id, class: "share-row" },
        box,
        el("span", { class: "share-text" },
          el("span", { class: "share-kind" },
            icon(e.kind === "teacher" ? "school" : "edit_note", "20"),
            e.kind === "teacher" ? T.teacher : T.pair,
            badge),
          el("span", { class: "share-name" }, e.sub ? `${e.title} · ${e.sub}` : keepName(e.title)),
          el("span", { class: "share-url" }, e.url),
          e.status === "replace" && el("span", { class: "share-url" }, `${T.yours} `, el("s", {}, e.current)))));
  });

  const selected = () => boxes.filter((b) => b.box.checked && !b.box.disabled);
  const refresh = () => {
    const n = selected().length;
    addBtn.textContent = T.add(n);
    addBtn.disabled = n === 0;
  };
  for (const { box } of boxes) box.addEventListener("change", refresh);
  refresh();

  addBtn.addEventListener("click", () => {
    const chosen = selected();
    const links = loadLinks(); // re-read: nothing else should have changed, but be safe
    for (const { entry } of chosen) links[entry.key] = entry.url;
    if (!saveLinks(links)) return finish(STRINGS.settingsView.storageBlocked, "error");
    finish(T.done(pluralize(chosen.length, STRINGS.units.links)), "saved");
  });
  cancelBtn.addEventListener("click", onDone);

  container.replaceChildren(el("section", { class: "card share" },
    heading,
    el("p", { class: "share-intro" }, T.intro),
    el("ul", { class: "share-list" }, items),
    el("div", { class: "share-actions" }, addBtn, cancelBtn)));
  heading.focus({ preventScroll: true });
}
