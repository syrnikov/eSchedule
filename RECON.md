# Phase 0 — how the OSAU schedule loads

Checked live on 2026-09-28.

## Short answer

The OSAU page (`osau.edu.ua/pro-universytet/pratsivnykam/rozklad-zanyat/`) has **no schedule form of its own**. Its article only embeds a third-party widget:

```html
<script src="//vnz.osvita.net/schedule-loader.ashx"></script>
<script>var schedule = new ait.Schedule("#schedule_container", 11912);</script>
```

`11912` is OSAU's university ID (`aVuzID`) in the vnz.osvita.net system. The loader pulls in `https://vnz.osvita.net/schedule.min.js`. That script builds the filter form and fetches everything from a **JSON API**, not an HTML table and not an iframe.

## Endpoint

```
GET https://vnz.osvita.net/WidgetSchedule.asmx/<Method>?<params>
```

- ASP.NET ASMX web service. The widget calls it as JSONP (`&callback=...`). It also returns plain JSON if you send the header `Content-Type: application/json; charset=utf-8`, and that's what we'll use.
- **Parameter values are JSON-encoded.** Strings go in double quotes (`aStudyGroupID="O4H7V339WI8I"`), a missing value is the literal `null`, and numbers and booleans are bare.
- **A User-Agent header is required.** Without one the server returns an HTML 404. Any non-empty UA works, including a descriptive one like `pary-scraper/0.1`.
- Responses are wrapped: `{"d": ...}`.
- No auth, no cookies, no CSRF token.

## ID lookup chain (the dropdowns send opaque keys, not names)

| Step | Method | Params | Result we need |
|---|---|---|---|
| 1 | `GetStudentScheduleFiltersData` | `aVuzID=11912` | ФГЗА = `"RYFFJ5JUEVBE"`, Денна = `"1"`, 3 курс = `"3"` |
| 2 | `GetStudyGroups` | `aVuzID=11912`, `aFacultyID="RYFFJ5JUEVBE"`, `aEducationForm="1"`, `aCourse="3"`, `aGiveStudyTimes=false` | `208-бак-3к денне 26-27` = **`"O4H7V339WI8I"`** |
| 3 | `GetScheduleDataX` | `aVuzID=11912`, `aStudyGroupID="O4H7V339WI8I"`, `aStartDate="DD.MM.YYYY"`, `aEndDate="DD.MM.YYYY"`, `aStudyTypeID=null` | the schedule |

The scraper only needs step 3 with the hard-coded group ID. Steps 1–2 are documented in case the ID changes (for example with a new academic year, since the group name ends in `26-27`).

## Example

```bash
curl -s -G -A "pary-scraper/0.1" \
  -H "Content-Type: application/json; charset=utf-8" \
  "https://vnz.osvita.net/WidgetSchedule.asmx/GetScheduleDataX" \
  --data-urlencode 'aVuzID=11912' \
  --data-urlencode 'aStudyGroupID="O4H7V339WI8I"' \
  --data-urlencode 'aStartDate="28.09.2026"' \
  --data-urlencode 'aEndDate="04.10.2026"' \
  --data-urlencode 'aStudyTypeID=null'
```

## Response format (`GetScheduleDataX`)

A flat array with one object per class. Groups are not nested and there are no rowspans:

```json
{"d":[{
  "__type": "VnzWeb.WidgetSchedule+ScheduleDataRow",
  "study_time": "08:15-09:35",
  "study_time_begin": "08:15",
  "study_time_end": "09:35",
  "week_day": "Понеділок",
  "full_date": "28.09.2026",
  "discipline": "Іноземна мова",
  "study_type": "Практичні",
  "cabinet": "онлайн",
  "employee": "Насакіна Світлана Вікторівна",
  "employee_short": "Насакіна С. В.",
  "contingent": "Група: 208-бак-3к денне 26-27",
  "chair_name": null
}]}
```

- `contingent` is either `Група: <name>` or `Підгрупа: 1а` / `Підгрупа: 1б`.
- `cabinet`, `employee` and `employee_short` can be **`null`**, for example on Кураторська година and Зустріч зі стейкхолдерами.
- If the range has no classes, you get `{"d":[]}`. A malformed date gets an HTTP 404 HTML page, so the scraper must check the status code and content type.

## Fixtures (`scraper/fixtures/`)

- `schedule-2026-09-28_2026-10-04.json` is the raw response for the test week. It has 16 rows, and filtering to `Група:` plus `Підгрупа: 1б` leaves the 14 rows from PLAN.md.
- `filters.json` and `study-groups-fgza-denna-3.json` are the ID lookups.

## Where PLAN.md doesn't match reality (proposed changes)

1. **Phase 1 parses JSON, not an HTML table.** No rowspan handling is needed. `parse.mjs` just maps API rows to class objects: `DD.MM.YYYY` → ISO, trim, strip the trailing `_`, `null` → `""`, and filter by `contingent`.
2. **Architecture stays the same.** Keep the GitHub Actions scraper. The API sends no CORS headers for plain JSON, and a browser can't set the User-Agent anyway.
3. **Test-data table fixes:**
   - The source spells it «Теплотехніка та гідрав**л**ика», not «гідравліка». We should keep the source spelling, because link keys are built from it.
   - The source has «ІТ-технології в проектуванні» written with **Cyrillic** І and Т (U+0406, U+0422) and **without** a «(1б)» suffix. PLAN.md has Latin «IT» and adds «(1б)». Proposal: keep the source name. The subgroup is already recorded in `audience: "subgroup"`.
   - The trailing underscore is confirmed: «Соціальна робота в громаді_».
