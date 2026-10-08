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
    ahead: (count, end) => `${count} сьогодні, фініш о ${end}`,
    left: (count, end) => `Ще ${count}, фініш о ${end}`,
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
    upcoming: (time) => `Перша пара о ${time}`,
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
    nextAt: (time) => `Далі о ${time} — можна перепочити`,
    tomorrowFirst: (time) => `Завтра перша пара о ${time}`,
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
  addLink: "Додати посилання",
  settings: "Налаштування",

  // "Сьогодні в тебе 3 пари"
  today: (count) => `Сьогодні в тебе ${count}`,
  nowBadge: "зараз",

  // Tomorrow card. The tone depends on how early the first class is.
  tomorrow: {
    // Before this time the start counts as early; from `lateFrom` on, as a lie-in.
    earlyBefore: "09:00",
    lateFrom: "11:00",
    line: (time, tail) => `Завтра о ${time} — ${tail}`,
    early: ["рано, але ти впораєшся ☕", "ставимо будильник ⏰", "кава буде доречною ☕"],
    normal: ["все за планом", "звичний ритм", "без поспіху"],
    late: ["можна трохи поспати 😴", "ранок вільний 🙌", "виспишся 😴"],
    count: (count) => `Усього ${count}`,
    none: ["Завтра пар немає — можна видихнути 😌", "Завтра вільний день 🙌"],
  },

  // Days ahead (#days): everything the schedule knows after today.
  days: {
    title: "Наступні дні",
    open: "Розклад на наступні дні",
    tomorrow: "Завтра",
    none: "Пар немає",
    empty: "Далі розкладу поки немає.",
    noSchedule: "Розклад ще не завантажено.",
  },

  // The floating tab bar on the three main screens.
  tabs: {
    label: "Розділи",
    main: "Пари",
    tasks: "Завдання",
    teachers: "Викладачі",
  },

  // Tasks (#tasks): what's due and when. Stored only on this device. A missed date is said
  // gently («Час минув»), never as a failure.
  tasks: {
    title: "Завдання",
    titleLabel: "Нове завдання",
    placeholder: "Що треба зробити?",
    subjectLabel: "Предмет",
    noSubject: "Без предмета",
    notesLabel: "Нотатки",
    notesPlaceholder: "Сторінки, вимоги, посилання…",
    nameLabel: "Назва",
    editDone: "Готово",
    delete: "Видалити",
    deleteConfirm: "Точно? Натисни ще раз",
    dueLabel: "Термін",
    dueNone: "Без терміну",
    dueToday: "Сьогодні",
    dueTomorrow: "Завтра",
    dueNextClass: "До пари",
    dueDate: "Дата",
    dateLabel: "Дата терміну",
    add: "Додати",
    added: (title) => `Додано: ${title}`,
    sections: {
      overdue: "Час минув",
      today: "Сьогодні",
      tomorrow: "Завтра",
      week: "Цього тижня",
      later: "Пізніше",
      noDate: "Без терміну",
    },
    done: "Виконані",
    clearDone: "Очистити виконані",
    clearConfirm: "Точно? Натисни ще раз",
    empty: "Поки нічого. Додай завдання — коли наближатиметься термін, воно з’явиться на головному екрані.",
    allDone: "Усе зроблено. Так тримати 🎉",
    markDone: (title) => `Виконано: ${title}`,
    markOpen: (title) => `Ще не виконано: ${title}`,
    remove: (title) => `Видалити: ${title}`,
    removeConfirm: (title) => `Натисни ще раз, щоб видалити: ${title}`,
    // When it's due, after the title: "сьогодні", "в четвер", "12 жовтня", "було на 3 жовтня"
    when: { today: "сьогодні", tomorrow: "завтра" },
    wasDue: (date) => `було на ${date}`,
    deviceOnly: "Завдання зберігаються лише на цьому пристрої.",
    storageBlocked: "Не вдалося зберегти: браузер блокує сховище",
  },

  // Home card: tasks due soon. The whole card opens «Завдання».
  deadlines: {
    line: (count) => `${count} найближчим часом`,
    next: (when, title) => `Найближче — ${when}: ${title}`,
    open: "Відкрити завдання",
    // On a class row: a task for this subject is due that day.
    mark: "Є завдання на цей день",
  },

  // Teachers (#teachers): their email addresses, typed in by the student, device only.
  teachers: {
    title: "Викладачі",
    hint: "Email-адреси зберігаються лише на цьому пристрої й потрапляють у резервну копію.",
    addEmail: "Додати email",
    emailLabel: (teacher) => `Email викладача: ${teacher}`,
    placeholder: "name@osau.edu.ua",
    invalid: "Схоже, в адресі помилка. Приклад: name@osau.edu.ua",
    saved: "Збережено",
    removed: "Адресу видалено",
    storageBlocked: "Не вдалося зберегти: браузер блокує сховище",
    write: (teacher) => `Написати листа: ${teacher}`,
    edit: (teacher) => `Змінити email: ${teacher}`,
    done: "Готово",
    // The letter: the subject says which class and group, the rest is up to the student.
    subject: (discipline, group) => [discipline, group].filter(Boolean).join(" · "),
    body: "Добрий день!\n\n",
    noSchedule: "Розклад ще не завантажено, тож список порожній.",
    empty: "У розкладі поки немає викладачів.",
  },

  // Opened from a reminder or an all-clear push (#join): one class, one button.
  joinView: {
    home: "На головну",
  },

  // Home card: this week's taps on «Приєднатися». Honest (a tap isn't attendance), never guilt:
  // nothing about missed classes, and a late typical time is simply not mentioned.
  // Present tense («заходиш») because Ukrainian past tense is gendered and we don't ask.
  stats: {
    line: (unit) => `${unit} цього тижня через «Приєднатися» 🎓`,
    early: (duration) => `Зазвичай заходиш за ${duration} до початку`,
    onTime: "Зазвичай заходиш хвилина в хвилину",
    open: "Відкрити статистику",
  },

  // Home header (top row): avatar → profile, gear → app settings, chart → stats.
  header: {
    profile: "Профіль",
    stats: "Статистика",
  },

  // «Статистика» (#stats): the same honesty rules as the home card. Counts only, no
  // percentages, nothing about missed classes.
  statsView: {
    title: "Статистика",
    periodLabel: "Період",
    periods: { week: "Тиждень", month: "Місяць", all: "Увесь час" },
    range: (from, to) => `${from} – ${to}`,
    since: (from) => `з ${from}`,
    heroLabel: "Через «Приєднатися»",
    groupLabel: "Показати за",
    groupings: { subjects: "Предмети", teachers: "Викладачі" },
    empty: "Тут з’являться пари, на які ти заходиш через «Приєднатися».",
    emptyPeriod: "За цей період поки нічого. Спробуй інший 🙂",
    dataGroup: "Твої дані",
  },

  // «Профіль» (#profile): the student's own things. App settings stay behind the gear.
  profileView: {
    title: "Профіль",
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
    reminderBody: (type, teacher, start) => [type, teacher, `початок о ${start}`].filter(Boolean).join(" · "),
    // A reminder that goes out while an alert is on.
    reminderBodyAlert: (body) => `Зараз тривога · ${body}`,
    alertTitle: (region) => `Повітряна тривога · ${region}`,
    alertBody: "Пара на паузі. Бережи себе 🙏",
    // The class hasn't started yet (it starts within 15 min).
    alertBodySoon: (start) => `Початок пари о ${start} на паузі. Бережи себе 🙏`,
    clearTitle: "Відбій! Повертаємось на пару 🙌",
    clearBody: (duration) => (duration ? `Тривога тривала ${duration}` : "Пара продовжується"),
    clearBodySoon: (start) => `Пара почнеться о ${start}`,
  },

  updatedAt: (date, time) => `Розклад оновлено ${date} о ${time}`,
  stale: "Розклад давно не оновлювався",
  loadError: "Не вдалося завантажити розклад",

  // First launch, or a link from the group: one page at a time, one button per page.
  onboarding: {
    next: "Продовжити",

    // Page: links from the group (opened with #share=…). Nothing is saved before the tap.
    linksTitle: (count) => `${count} на пари від групи`,
    emailsTitle: (count) => `Email ${count} від групи`,
    emailsText: "Додам їх — і листа викладачу можна буде написати одним дотиком. Вони лишаться тільки на цьому пристрої.",
    linksEmails: (count) => `А ще email ${count}.`,
    emailBadge: "email",
    linksText: "Додам їх — і кнопка «Приєднатися» запрацює одразу. Вони лишаться тільки на цьому пристрої.",
    linksReplace: (count) => `Оновлять твої: ${count}.`,
    linksDetails: "Що саме",
    linksReplaces: "оновить твоє",
    linksAdd: "Додати й продовжити",
    linksSkip: "Не додавати",
    brokenTitle: "Посилання не відкрилось",
    broken: "Воно пошкоджене або неповне. Попроси надіслати його ще раз.",
    tooOld: "Цей браузер не може відкрити таке посилання. Спробуй у свіжішому Chrome чи Safari.",
    storageBlocked: "Не вдалося зберегти: браузер блокує сховище.",

    // Page: what the app does.
    hello: "Привіт! 👋",
    intro: "Я — «Пари». Ось чим допоможу:",
    features: [
      { icon: "videocam", title: "Пара перед очима", text: "Видно, що зараз і що далі. Заходиш одним дотиком." },
      { icon: "warning", title: "Пауза на час тривоги", text: "Скажу, коли тривога і коли відбій." },
      { icon: "notifications", title: "Нагадування", text: "Напишу за кілька хвилин до початку." },
    ],

    // Page: iPhone in a browser tab. Reminders only work from the home screen.
    installTitle: "Додай «Пари» на головний екран",
    installText: "Так я зможу нагадувати про пари, а відкриватимусь як звичайний застосунок.",
    installTelegram: { icon: "open_in_browser", text: "Відкрий цю сторінку в Safari: у Telegram натисни ••• або значок компаса" },
    installSteps: [
      { icon: "ios_share", text: "Натисни «Поділитися» внизу Safari" },
      { icon: "add_box", text: "Обери «На початковий екран»" },
      { icon: "check_circle", text: "Відкрий «Пари» з головного екрана" },
    ],
    installHint: "Немає кнопки «Поділитися»? Спершу відкрий цю сторінку в Safari.",
    installSkip: "Продовжити в браузері",

    // Page: the name
    question: "Як до тебе звертатися?",
    hint: "Напиши так, як тобі приємно чути: «Артеме», «Олю». Це лишиться тільки на цьому пристрої.",
    placeholder: "Наприклад, Артеме",
    nameNext: "Далі",
    skip: "Пропустити",

    // Page: reminders
    pushTitle: "Нагадувати про пари? 🔔",
    pushText: "Напишу за 5 хв до початку й дам знати про тривогу та відбій під час пари.",
    pushEnable: "Увімкнути нагадування",
    pushLater: "Не зараз",
  },

  // «Що нового»: shown once to students who already use the app. Bump `version` when the
  // items change. New students never see it (they've just been shown everything).
  whatsNew: {
    version: 3,
    title: "Що нового",
    items: [
      { icon: "insert_chart", title: "Статистика", text: "Пари через «Приєднатися» за тиждень, місяць чи весь час — по предметах і викладачах." },
      { icon: "person", title: "Профіль", text: "Ім’я та резервна копія — під аватаркою вгорі. Налаштування застосунку — під шестернею." },
      { icon: "assignment", title: "Завдання й викладачі", text: "Нотатки до завдань, і лист викладачу одним дотиком." },
    ],
    button: "Продовжити",
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
    shareNothing: "Поки немає чим ділитися: додай хоча б одне посилання чи email.",
    shareAnd: (a, b) => `${a} і ${b}`,
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
    backupHint: "Файл JSON з посиланнями, email-адресами, завданнями й статистикою. Імпорт додає все до вже збереженого.",
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
    tasks: { one: "завдання", few: "завдання", many: "завдань" },
    emails: { one: "email-адреса", few: "email-адреси", many: "email-адрес" },
    teachers: { one: "викладача", few: "викладачів", many: "викладачів" },
    subjects: { one: "предмет", few: "предмети", many: "предметів" },
    days: { one: "день", few: "дні", many: "днів" },
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
