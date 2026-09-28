// First launch: "Як до тебе звертатися?". One card, skippable. Calls onDone() either way.

import { STRINGS } from "./strings.js";
import { el } from "./dom.js";
import { saveProfile, MAX_NAME_LENGTH } from "./profile.js";

const W = STRINGS.welcome;

export function renderWelcome(container, onDone) {
  const input = el("input", {
    id: "welcome-name", type: "text", autocomplete: "given-name", autocapitalize: "words",
    enterkeyhint: "done", maxlength: String(MAX_NAME_LENGTH), placeholder: W.placeholder,
    "aria-describedby": "welcome-hint",
  });

  const finish = (name) => {
    saveProfile({ name }); // if storage is blocked we still move on; main.js remembers for this session
    onDone();
  };

  const form = el("form", { class: "welcome-form" },
    el("label", { for: "welcome-name", class: "welcome-question" }, W.question),
    el("p", { class: "field-context", id: "welcome-hint" }, W.hint),
    input,
    el("div", { class: "welcome-actions" },
      el("button", { type: "submit", class: "btn btn--primary" }, W.next),
      el("button", { type: "button", class: "btn btn--text", "data-skip": "" }, W.skip)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    finish(input.value);
  });
  form.querySelector("[data-skip]").addEventListener("click", () => finish(""));

  container.replaceChildren(
    el("section", { class: "card welcome" },
      el("h1", { class: "welcome-hello", tabindex: "-1" }, W.hello),
      el("p", { class: "welcome-intro" }, W.intro),
      form));

  // Focus the heading, not the input: on phones the keyboard would cover the intro.
  container.querySelector(".welcome-hello").focus({ preventScroll: true });
}
