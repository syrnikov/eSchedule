// All UI copy lives here. Informal «ти», sentence case, real dashes and quotes.
//   = non-breaking space (keeps "15 хв" on one line).

export const STRINGS = {
  appTitle: "Пари",

  status: {
    live: "Наживо",
    soon: (mins) => `Почнеться за ${mins} хв`,
    upcoming: (time) => `Перша пара о ${time}`,
    paused: "Пауза · повітряна тривога",
    resumed: "Відбій тривоги",
    break: "Перерва",
    done: "На сьогодні все 🎉",
    weekend: "Вихідні",
    dayOff: "Сьогодні пар немає",
    nodata: "Немає розкладу",
  },

  detail: {
    left: (duration) => `Ще ${duration}`,
    startsIn: (duration) => `Через ${duration}`,
    nextAt: (time) => `Далі о ${time}`,
    tomorrowFirst: (time) => `Завтра перша пара о ${time}`,
    nextOn: (when) => `Наступна пара ${when}`,
    noneAhead: "Попереду пар немає",
    nodata: "Спробуй оновити пізніше",
    paused: "Одеська область. Бережи себе 🙏",
    resumed: "Пара продовжується",
  },

  // "Наступна пара в понеділок" — preposition depends on the next word.
  weekdayOn: ["в неділю", "в понеділок", "у вівторок", "в середу", "в четвер", "в п’ятницю", "в суботу"],

  alarm: {
    active: "Повітряна тривога · Одеська область",
    unknown: "Статус тривоги невідомий",
  },

  join: "Приєднатися",
  noLink: "Посилання немає",
  addLink: "Додати",
  settings: "Налаштування",

  today: "Сьогодні",
  tomorrow: "Завтра",
  tomorrowSummary: (time, count) => `Перша пара о ${time} · ${count}`,
  tomorrowNone: "Пар немає",
  nowBadge: "зараз",

  updatedAt: (date, time) => `Розклад оновлено ${date} о ${time}`,
  stale: "Дані можуть бути застарілими",
  loadError: "Не вдалося завантажити розклад",

  settingsView: {
    back: "Назад",
    title: "Налаштування",

    // Group: links
    linksGroup: "Посилання",
    deviceOnly: "Посилання зберігаються лише на цьому пристрої. Зроби резервну копію, щоб перенести їх на інший пристрій.",
    teachersTitle: "Викладачі",
    teachersHint: "Одне посилання на всі пари викладача.",
    pairsTitle: "Окремі посилання для пар",
    pairsCount: (count) => `збережено: ${count}`,
    pairsHint: "Мають перевагу над посиланням викладача. Знадобляться для пар без викладача, як-от «Кураторська година».",
    placeholder: "https://zoom.us/j/…",
    invalid: "Посилання має починатися з https://",
    saved: "Збережено",
    storageBlocked: "Не вдалося зберегти: браузер блокує сховище",
    noSchedule: "Розклад ще не завантажено, тож список порожній.",

    // Group: backup
    backupGroup: "Резервна копія",
    backupHint: "Файл JSON з усіма посиланнями. Імпорт додає посилання до вже збережених.",
    export: "Експортувати",
    import: "Імпортувати",
    exportFile: (date) => `pary-links-${date}.json`,
    imported: (count) => `Імпортовано: ${count}`,
    importError: "Не вдалося прочитати файл. Потрібен JSON-експорт із цього застосунку.",

    // Group: about
    aboutGroup: "Про застосунок",
    tagline: "Зроблено з 💛 для навчання без хаосу",
    author: "Розробка: Артем Сирніков",
    credits: [
      { text: "Шрифт e-Ukraine — Міністерство цифрової трансформації України", href: "https://thedigital.gov.ua/fonts" },
      { text: "Іконки Material Symbols — Google, Apache 2.0", href: "https://fonts.google.com/icons" },
      { text: "Розклад — osau.edu.ua", href: "https://osau.edu.ua/pro-universytet/pratsivnykam/rozklad-zanyat/" },
      { text: "Дані про тривоги — ubilling.net.ua", href: "https://ubilling.net.ua/aerialalerts/" },
    ],
  },

  // Values that come from the schedule data (not shown as-is, used for matching).
  data: {
    onlineRoom: "онлайн", // not worth showing: every class is online
    typeIcons: { "Лекції": "school", "Практичні": "edit_note", "Лабораторні": "science" },
    defaultTypeIcon: "school",
  },

  // Plural forms for Intl.PluralRules("uk"): one / few / many.
  units: {
    minutes: { one: "хв", few: "хв", many: "хв" },
    hours: { one: "год", few: "год", many: "год" },
    classes: { one: "пара", few: "пари", many: "пар" },
    links: { one: "посилання", few: "посилання", many: "посилань" },
  },
};
