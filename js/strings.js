// All UI copy lives here. Informal «ти», sentence case, real dashes and quotes.
//   = non-breaking space (keeps "15 хв" on one line).
// Voice: a friend who knows your schedule. Warm, short, lightly funny; never sarcastic
// about the war or the student. At most one emoji per string.
//
// Pools (arrays) are variants of often-seen strings. pick() chooses one per day, so the
// text changes from day to day but never flickers between re-renders.

export const STRINGS = {
  appTitle: "Пари",

  // Header: greeting by time of day (Kyiv). name is "" when the student skipped it.
  greeting: {
    morning: (name) => (name ? `Доброго ранку, ${name}!` : "Доброго ранку!"),
    day: (name) => (name ? `Добрий день, ${name}!` : "Добрий день!"),
    evening: (name) => (name ? `Добрий вечір, ${name}!` : "Добрий вечір!"),
    night: [
      (name) => (name ? `Ще не спиш, ${name}?` : "Ще не спиш?"),
      (name) => (name ? `Нічна зміна, ${name}? 🦉` : "Нічна зміна? 🦉"),
      (name) => (name ? `${name}, час потроху спати 🌙` : "Час потроху спати 🌙"),
    ],
  },

  // Header: one line about the day.
  summary: {
    ahead: (count, end) => `${count} сьогодні, фініш о ${end}`,
    left: (count, end) => `Ще ${count}, фініш о ${end}`,
    done: (count) => [
      `${count} позаду — решта дня твоя`,
      `${count} позаду. Можна видихнути`,
    ],
    free: [
      "Сьогодні пар немає — відпочивай 😌",
      "Пар сьогодні немає. Заслужений відпочинок 😌",
    ],
  },

  status: {
    live: "Наживо",
    soon: (mins) => `Почнеться за ${mins} хв`,
    upcoming: (time) => `Перша пара о ${time}`,
    paused: "Пауза · повітряна тривога",
    resumed: "Відбій! Повертаємось на пару 🙌",
    break: "Перерва",
    done: "На сьогодні все. Ти молодець 🎉",
    weekend: "Вихідні",
    dayOff: "Вільний день",
    nodata: "Немає розкладу",
  },

  detail: {
    left: (duration) => [
      `Ще ${duration} — тримайся 💪`,
      `Ще ${duration} — ти впораєшся`,
      `Ще ${duration}, а потім перерва`,
    ],
    soon: [
      "Встигнеш налити чаю ☕",
      "Час знайти навушники 🎧",
      "Ще є хвилинка видихнути",
    ],
    startsIn: (duration) => `Через ${duration}`,
    nextAt: (time) => `Далі о ${time} — можна перепочити`,
    tomorrowFirst: (time) => `Завтра перша пара о ${time}`,
    nextOn: (when) => `Наступна пара ${when}`,
    noneAhead: "Попереду пар немає",
    nodata: "Спробуй оновити пізніше",
    paused: "Одеська область. Бережи себе 🙏",
    resumed: "Пара продовжується",
    alertLasted: (duration) => `Тривога тривала ${duration}`,
  },

  // "Наступна пара в понеділок" — preposition depends on the next word.
  weekdayOn: ["в неділю", "в понеділок", "у вівторок", "в середу", "в четвер", "в п’ятницю", "в суботу"],

  alarm: {
    active: "Повітряна тривога · Одеська область",
    unknown: "Статус тривоги невідомий",
  },

  join: "Приєднатися",
  noLink: "Посилання ще не додано",
  addLink: "Додати",
  settings: "Налаштування",

  // "Сьогодні в тебе 3 пари"
  today: (count) => `Сьогодні в тебе ${count}`,
  nowBadge: "зараз",

  // Tomorrow card. The tone depends on how early the first class is.
  tomorrow: {
    // Before this time the start counts as early; from `lateFrom` on, as a lie-in.
    earlyBefore: "09:00",
    lateFrom: "11:00",
    line: (time, tail) => `Завтра о ${time} — ${tail}`,
    early: ["рано, але ти впораєшся ☕", "ставимо будильник ⏰", "кава буде доречною ☕"],
    normal: ["все за планом", "звичний ритм", "без поспіху"],
    late: ["можна трохи поспати 😴", "ранок вільний 🙌", "виспишся 😴"],
    count: (count) => `Усього ${count}`,
    none: ["Завтра пар немає — можна видихнути 😌", "Завтра вільний день 🙌"],
  },

  // Opening a shared link: confirm before anything is saved.
  shareImport: {
    title: "Посилання від групи 🤝",
    intro: "Ось що хтось із групи тобі надіслав. Вибери, що додати, — збережеться тільки на цьому пристрої.",
    teacher: "Викладач",
    pair: "Окрема пара",
    isNew: "Нове",
    replaces: "Замінить твоє",
    yours: "Зараз у тебе:",
    same: "Вже є",
    add: (count) => `Додати (${count})`,
    cancel: "Не зараз",
    nothingNew: "У тебе вже є всі ці посилання 👌",
    done: (count) => `Додано: ${count}`,
    broken: "Це посилання пошкоджене або неповне. Попроси надіслати його ще раз.",
    tooOld: "Цей браузер не може відкрити таке посилання. Спробуй у свіжішому Chrome чи Safari.",
    back: "На головну",
  },

  // Home card: this week's taps on «Приєднатися». Honest (a tap isn't attendance), never guilt:
  // nothing about missed classes, and a late typical time is simply not mentioned.
  // Present tense («заходиш») because Ukrainian past tense is gendered and we don't ask.
  stats: {
    line: (unit) => `${unit} цього тижня через «Приєднатися» 🎓`,
    early: (duration) => `Зазвичай заходиш за ${duration} до початку`,
    onTime: "Зазвичай заходиш хвилина в хвилину",
  },

  // Home card offering reminders (shown once, in context).
  pushCard: {
    title: "Нагадувати про пари? 🔔",
    body: "Напишу за 5 хв до початку, щоб нічого не пропустити.",
    iosBody: "На iPhone для цього треба спершу додати «Пари» на головний екран.",
    enable: "Увімкнути",
    how: "Як це зробити",
    later: "Не зараз",
  },

  // Push notification texts. Sent by the Worker, so: no names, no links.
  push: {
    reminderTitle: (duration, discipline) => `Через ${duration} — ${discipline} 🎓`,
    reminderBody: (type, teacher, start) => [type, teacher, `початок о ${start}`].filter(Boolean).join(" · "),
    alertTitle: (region) => `Повітряна тривога · ${region}`,
    alertBody: "Пара на паузі. Бережи себе 🙏",
    clearTitle: "Відбій! Повертаємось на пару 🙌",
    clearBody: (duration) => (duration ? `Тривога тривала ${duration}` : "Пара продовжується"),
  },

  updatedAt: (date, time) => `Розклад оновлено ${date} о ${time}`,
  stale: "Розклад давно не оновлювався",
  loadError: "Не вдалося завантажити розклад",

  // First launch
  welcome: {
    hello: "Привіт! 👋",
    intro: "Я підкажу, яка зараз пара, і дам знати, коли вона на паузі через тривогу.",
    question: "Як до тебе звертатися?",
    hint: "Напиши так, як тобі приємно чути: «Артеме», «Олю». Це лишиться тільки на цьому пристрої.",
    placeholder: "Наприклад, Артеме",
    next: "Далі",
    skip: "Пропустити",
  },

  settingsView: {
    back: "Назад",
    title: "Налаштування",

    // Group: about you
    profileGroup: "Про тебе",
    nameLabel: "Як до тебе звертатися",
    nameHint: "Для привітання на головному екрані. Можна залишити порожнім.",
    namePlaceholder: "Наприклад, Артеме",

    // Group: reminders (push)
    pushGroup: "Нагадування",
    remindersLabel: "Нагадувати про пари",
    remindersHint: "Сповіщення перед початком пари. На сервер іде лише назва групи — ім’я й посилання лишаються тут.",
    leadLabel: "За скільки хвилин",
    leadOption: (mins) => `${mins} хв`,
    alertsLabel: "Тривога під час пари",
    alertsHint: (region) => `Коли тривога починається чи закінчується посеред пари · ${region}`,
    iosTitle: "Додай на головний екран, щоб я міг нагадувати про пари",
    iosSteps: [
      { icon: "ios_share", text: "Натисни «Поділитися» внизу Safari" },
      { icon: "add_box", text: "Обери «На початковий екран»" },
      { icon: "notifications", text: "Відкрий «Пари» з головного екрана й увімкни нагадування тут" },
    ],
    pushUnsupported: "Цей браузер не вміє показувати сповіщення 😕",
    pushDenied: "Сповіщення вимкнені в налаштуваннях браузера. Дозволь їх для цього сайту — і я знову зможу нагадувати.",
    pushNoSchedule: "Спершу має завантажитися розклад.",
    pushWorking: "Хвилинку…",
    pushOn: "Готово! Нагадаю вчасно 🔔",
    pushOff: "Сповіщення вимкнено",
    pushError: "Не вдалося зберегти. Спробуй ще раз трохи згодом.",

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

    // Share with the group (links travel in the URL's #fragment, never to a server)
    shareTitle: "Поділитися з групою",
    shareHint: (count) => `Одне посилання, в якому ${count}. Відкриєш його — і в одногрупників усе з’явиться після підтвердження.`,
    shareWarning: "Посилання на пари часто містять паролі. Надсилай тільки своїй групі.",
    shareButton: "Поділитися",
    shareNothing: "Поки немає чим ділитися: додай хоча б одне посилання.",
    shareCopied: "Посилання скопійовано — встав його в чат групи",
    shareCopyManual: "Скопіюй це посилання й надішли групі:",
    shareText: "Посилання на пари для нашої групи",

    // Group: stats
    statsGroup: "Статистика",
    statsHint: "Коли тиснеш «Приєднатися», я записую час і пару — тільки на цьому пристрої. Це не відвідуваність, а просто підказка для тебе.",
    statsCount: (count) => `Збережено: ${count}`,
    statsEmpty: "Поки порожньо.",
    statsClear: "Очистити статистику",
    statsClearConfirm: "Точно? Натисни ще раз",
    statsCleared: "Статистику очищено",

    // Group: backup
    backupGroup: "Резервна копія",
    backupHint: "Файл JSON з посиланнями й статистикою. Імпорт додає все до вже збереженого.",
    export: "Експортувати",
    import: "Імпортувати",
    exportFile: (date) => `pary-links-${date}.json`,
    imported: (count) => `Імпортовано: ${count}`,
    importError: "Не вдалося прочитати файл. Потрібен JSON-експорт із цього застосунку.",

    // Credits footer
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
    // Lectures get a filled chip; everything hands-on gets an outlined one.
    filledTypes: ["Лекції"],
  },

  // Plural forms for Intl.PluralRules("uk"): one / few / many.
  units: {
    minutes: { one: "хв", few: "хв", many: "хв" },
    hours: { one: "год", few: "год", many: "год" },
    classes: { one: "пара", few: "пари", many: "пар" },
    links: { one: "посилання", few: "посилання", many: "посилань" },
    records: { one: "запис", few: "записи", many: "записів" },
  },
};

// Small, stable string hash (FNV-1a). Same input → same number, on every device.
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// One variant from a pool, fixed for a given day + slot (so it doesn't flicker).
// pick(STRINGS.detail.soon, "2026-09-28", "soon:08:15")
export function pick(pool, day, slot = "") {
  if (!Array.isArray(pool)) return pool;
  return pool[hash(`${day}|${slot}`) % pool.length];
}
