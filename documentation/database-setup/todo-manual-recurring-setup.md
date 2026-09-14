# To Do List — Manual Setup & Recurring Task Guide

This document is the reference for manually creating and maintaining the **To Do List** database used by Office Orbit.

It captures the final compact recurrence model, the tested `Show Today` behavior, the required database properties, view filters, and examples for Daily, Weekly, Monthly, Yearly, interval-based, and non-recurring tasks.

---

## 1. Core behavior

The To Do database supports two major kinds of tasks:

1. **Normal tasks**
   - May have a Due Date.
   - May have no Due Date.
   - A normal task without a Due Date stays visible in **Today** every day until it is completed.

2. **Recurring tasks**
   - Must not use Due Date.
   - Recurrence is controlled by `Schedule` and the supporting recurrence properties.
   - A recurring task remains visible on its scheduled day even if its Status is `Done`.

### Important rules

- `Due Date` is optional for normal tasks.
- If `Schedule` is set, the task is recurring.
- A recurring task should always have `Due Date = empty`.
- `Recurring` is a Formula and must never be edited manually.
- `Show Today` is a Formula and must never be edited manually.
- `Schedule` is the source of truth for whether a task is recurring.
- Do not create two different ways to represent the same recurrence.

---

## 2. Final database properties

| Property | Type | Purpose |
|---|---|---|
| `To Do` | Title | Task title |
| `Status` | Status | `Not started`, `In progress`, `Done` |
| `Due Date` | Date | Optional; normal tasks only |
| `Schedule` | Select | `Daily`, `Weekly`, `Monthly`, `Yearly` |
| `Repeat On` | Multi-select | Weekdays used by Weekly schedules |
| `Interval` | Number | Optional interval, mainly for Daily/Weekly |
| `Repeat Day` | Number | Day number for Monthly or Yearly recurrence |
| `Repeat Month` | Select | Month used by Yearly recurrence |
| `Month End` | Select | `Last day`, `Day before last day` |
| `Repeat Start` | Date | Anchor date when `Interval > 1` |
| `Recurring` | Formula | Automatically true when Schedule is present |
| `Show Today` | Formula | Controls the Today view |
| `Notes` | Rich text | Optional notes |
| `Assignee` | Person | Existing Notion task property |
| `Created` | Created time | Automatic |
| `Last Edited` | Last edited time | Automatic |

---

## 3. Property options

### Schedule

Use exactly:

```text
Daily
Weekly
Monthly
Yearly
```

Do not keep `Custom`.

---

### Repeat On

Type: **Multi-select**

Use:

```text
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday
```

This is primarily used by `Weekly`.

Example:

```text
Schedule  = Weekly
Repeat On = Tuesday, Friday
```

means the task is active every Tuesday and Friday.

---

### Repeat Month

Type: **Select**

Use all 12 months:

```text
January
February
March
April
May
June
July
August
September
October
November
December
```

This is used only by `Yearly`.

---

### Month End

Type: **Select**

Use only:

```text
Last day
Day before last day
```

Do not add:

```text
Day of month
Specific day
```

Those are unnecessary because `Repeat Day` already handles a specific monthly date.

---

## 4. Recurring formula

Property: `Recurring`

Type: **Formula**

Use:

```notion
not empty(prop("Schedule"))
```

Behavior:

```text
Schedule empty   → Recurring = false
Schedule present → Recurring = true
```

---

## 5. Show Today formula

Property: `Show Today`

Type: **Formula**

Use this complete formula:

```notion
ifs(
  and(
    prop("Schedule") == "Daily",
    or(
      empty(prop("Interval")),
      prop("Interval") <= 1,
      and(
        not empty(prop("Repeat Start")),
        dateBetween(
          today(),
          if(empty(prop("Repeat Start")), today(), prop("Repeat Start")),
          "days"
        ) >= 0,
        mod(
          dateBetween(
            today(),
            if(empty(prop("Repeat Start")), today(), prop("Repeat Start")),
            "days"
          ),
          if(
            or(empty(prop("Interval")), prop("Interval") <= 0),
            1,
            prop("Interval")
          )
        ) == 0
      )
    )
  ),
  true,

  and(
    prop("Schedule") == "Weekly",
    prop("Repeat On").includes(formatDate(today(), "dddd")),
    or(
      empty(prop("Interval")),
      prop("Interval") <= 1,
      and(
        not empty(prop("Repeat Start")),
        dateBetween(
          today(),
          if(empty(prop("Repeat Start")), today(), prop("Repeat Start")),
          "days"
        ) >= 0,
        mod(
          floor(
            dateBetween(
              today(),
              if(empty(prop("Repeat Start")), today(), prop("Repeat Start")),
              "days"
            ) / 7
          ),
          if(
            or(empty(prop("Interval")), prop("Interval") <= 0),
            1,
            prop("Interval")
          )
        ) == 0
      )
    )
  ),
  true,

  and(
    prop("Schedule") == "Monthly",
    empty(prop("Month End")),
    not empty(prop("Repeat Day")),
    prop("Repeat Day") == toNumber(formatDate(today(), "D"))
  ),
  true,

  and(
    prop("Schedule") == "Monthly",
    prop("Month End") == "Last day",
    or(
      and(
        toNumber(formatDate(today(), "M")) == 2,
        toNumber(formatDate(today(), "D")) == 28
      ),
      and(
        or(
          toNumber(formatDate(today(), "M")) == 4,
          toNumber(formatDate(today(), "M")) == 6,
          toNumber(formatDate(today(), "M")) == 9,
          toNumber(formatDate(today(), "M")) == 11
        ),
        toNumber(formatDate(today(), "D")) == 30
      ),
      and(
        or(
          toNumber(formatDate(today(), "M")) == 1,
          toNumber(formatDate(today(), "M")) == 3,
          toNumber(formatDate(today(), "M")) == 5,
          toNumber(formatDate(today(), "M")) == 7,
          toNumber(formatDate(today(), "M")) == 8,
          toNumber(formatDate(today(), "M")) == 10,
          toNumber(formatDate(today(), "M")) == 12
        ),
        toNumber(formatDate(today(), "D")) == 31
      )
    )
  ),
  true,

  and(
    prop("Schedule") == "Monthly",
    prop("Month End") == "Day before last day",
    or(
      and(
        toNumber(formatDate(today(), "M")) == 2,
        toNumber(formatDate(today(), "D")) == 27
      ),
      and(
        or(
          toNumber(formatDate(today(), "M")) == 4,
          toNumber(formatDate(today(), "M")) == 6,
          toNumber(formatDate(today(), "M")) == 9,
          toNumber(formatDate(today(), "M")) == 11
        ),
        toNumber(formatDate(today(), "D")) == 29
      ),
      and(
        or(
          toNumber(formatDate(today(), "M")) == 1,
          toNumber(formatDate(today(), "M")) == 3,
          toNumber(formatDate(today(), "M")) == 5,
          toNumber(formatDate(today(), "M")) == 7,
          toNumber(formatDate(today(), "M")) == 8,
          toNumber(formatDate(today(), "M")) == 10,
          toNumber(formatDate(today(), "M")) == 12
        ),
        toNumber(formatDate(today(), "D")) == 30
      )
    )
  ),
  true,

  and(
    prop("Schedule") == "Yearly",
    prop("Repeat Month") == formatDate(today(), "MMMM"),
    not empty(prop("Repeat Day")),
    prop("Repeat Day") == toNumber(formatDate(today(), "D"))
  ),
  true,

  and(
    empty(prop("Schedule")),
    empty(prop("Due Date")),
    prop("Status") != "Done"
  ),
  true,

  and(
    empty(prop("Schedule")),
    not empty(prop("Due Date")),
    formatDate(prop("Due Date"), "YYYY-MM-DD") ==
      formatDate(today(), "YYYY-MM-DD")
  ),
  true,

  false
)
```

---

## 6. Show Today behavior

The formula intentionally implements these rules:

| Task | Show Today |
|---|---|
| Normal task, Due Date = today | Yes |
| Normal task, Due Date = yesterday | No |
| Normal task, Due Date = tomorrow | No |
| Normal task, no Due Date, open | Yes |
| Normal task, no Due Date, Done | No |
| Daily recurring | Yes every day |
| Weekly recurring | Yes on selected weekday(s) |
| Monthly specific day | Yes on Repeat Day |
| Monthly last day | Yes on calculated month end |
| Monthly day before last | Yes one day before calculated month end |
| Yearly | Yes when Repeat Month + Repeat Day match |
| Recurring task scheduled today and Done | Yes |

---

## 7. February rule

This system intentionally ignores February 29.

Use:

```text
February last day            = 28
February day before last     = 27
```

Even during a leap year, the recurrence model continues to use February 28.

---

## 8. Manual task recipes

### Normal task with Due Date

Example:

```text
To Do      = Submit report
Status     = Not started
Due Date   = 2026-09-20
Schedule   = empty
```

All recurrence fields remain empty.

---

### Normal task without Due Date

Example:

```text
To Do      = Read Angular documentation
Status     = Not started
Due Date   = empty
Schedule   = empty
```

Behavior:

- Appears in Today every day.
- Stops appearing in Today once Status becomes `Done`.

---

### Daily

```text
Schedule     = Daily
Interval     = empty
Repeat Start = empty
Due Date     = empty
```

Appears every day.

---

### Every 3 days

```text
Schedule     = Daily
Interval     = 3
Repeat Start = 2026-09-14
Due Date     = empty
```

Example sequence:

```text
Sep 14 → show
Sep 15 → hide
Sep 16 → hide
Sep 17 → show
```

---

### Every Monday

```text
Schedule  = Weekly
Repeat On = Monday
Interval  = empty
Due Date  = empty
```

---

### Every Tuesday and Friday

```text
Schedule  = Weekly
Repeat On = Tuesday, Friday
Interval  = empty
Due Date  = empty
```

There is no separate Custom schedule for this.

---

### Every 2 weeks on Monday

```text
Schedule     = Weekly
Repeat On    = Monday
Interval     = 2
Repeat Start = 2026-09-14
Due Date     = empty
```

`Repeat Start` establishes which week is the first active week.

---

### Every 2 weeks on Tuesday and Friday

```text
Schedule     = Weekly
Repeat On    = Tuesday, Friday
Interval     = 2
Repeat Start = 2026-09-14
Due Date     = empty
```

---

### Every month on the 15th

```text
Schedule   = Monthly
Repeat Day = 15
Month End  = empty
Due Date   = empty
```

Do not set Month End.

---

### Last day of every month

```text
Schedule   = Monthly
Repeat Day = empty
Month End  = Last day
Due Date   = empty
```

Expected month-end dates:

```text
Jan → 31
Feb → 28
Mar → 31
Apr → 30
May → 31
Jun → 30
Jul → 31
Aug → 31
Sep → 30
Oct → 31
Nov → 30
Dec → 31
```

---

### Day before last day of every month

```text
Schedule   = Monthly
Repeat Day = empty
Month End  = Day before last day
Due Date   = empty
```

Expected dates:

```text
Jan → 30
Feb → 27
Mar → 30
Apr → 29
May → 30
Jun → 29
Jul → 30
Aug → 30
Sep → 29
Oct → 30
Nov → 29
Dec → 30
```

---

### Yearly — December 25

```text
Schedule     = Yearly
Repeat Month = December
Repeat Day   = 25
Due Date     = empty
```

---

## 9. Field usage by Schedule

Use this table when manually editing a task.

| Schedule | Repeat On | Interval | Repeat Day | Repeat Month | Month End | Repeat Start |
|---|---:|---:|---:|---:|---:|---:|
| Daily | — | Optional | — | — | — | Required only when Interval > 1 |
| Weekly | Required | Optional | — | — | — | Required only when Interval > 1 |
| Monthly specific day | — | — | Required | — | Empty | — |
| Monthly month-end | — | — | Empty | — | Required | — |
| Yearly | — | — | Required | Required | — | — |

`—` means leave empty.

---

## 10. Due Date rule for recurring tasks

Recurring tasks must not use Due Date.

Correct:

```text
Schedule = Weekly
Due Date = empty
```

Incorrect:

```text
Schedule = Weekly
Due Date = 2026-09-20
```

Office Orbit should later enforce this rule in the UI:

```text
Schedule empty
→ show Due Date

Schedule selected
→ clear Due Date
→ hide Due Date
```

---

## 11. Recommended Notion views

### All

No filter.

---

### Open

Filter:

```text
Status = Not started
OR
Status = In progress
```

Recurring and normal tasks may both appear.

---

### Today

Filter only:

```text
Show Today = checked
```

Do not add Status, Due Date, Schedule, or recurrence filters.

Recommended sort:

```text
Status ascending
```

Keep Status order:

```text
Not started
In progress
Done
```

This keeps completed tasks at the bottom.

---

### Upcoming

Filters:

```text
Status = Not started OR In progress
AND
Due Date is after Today
AND
Schedule is empty
```

Sort:

```text
Due Date ascending
```

The `Schedule is empty` condition prevents recurring tasks from leaking into Upcoming even if someone accidentally assigns a Due Date.

---

### Done

Filter:

```text
Status = Done
```

---

### Overdue — optional

Filters:

```text
Status = Not started OR In progress
AND
Due Date is before Today
AND
Schedule is empty
```

---

### Recurring — optional

Filter:

```text
Schedule is not empty
```

Do not add a Status filter if completed recurring tasks should remain visible.

---

## 12. Testing the formula with a fake date

Do not modify the real `Show Today` formula to test future dates.

Instead create a temporary Formula property:

```text
Show Test
```

Copy the `Show Today` formula and replace every:

```notion
today()
```

with a fixed date such as:

```notion
parseDate("2026-09-30")
```

Examples:

### September 30

```text
Monthly + Repeat Day 30       → checked
Month End = Last day          → checked
Month End = Day before last   → unchecked
```

### September 29

```text
Month End = Last day          → unchecked
Month End = Day before last   → checked
```

### February

```text
2026-02-28 + Last day             → checked
2026-02-27 + Day before last day  → checked
```

### October

```text
2026-10-31 + Last day             → checked
2026-10-30 + Day before last day  → checked
```

Delete `Show Test` after validation.

---

## 13. Expected recurring status behavior

A recurring task scheduled for today remains in Today even after being marked Done.

Example:

```text
Schedule   = Daily
Status     = Done
Show Today = true
```

A normal undated task behaves differently:

```text
Schedule   = empty
Due Date   = empty
Status     = Done
Show Today = false
```

A normal task due today remains visible for that day even if completed:

```text
Schedule   = empty
Due Date   = today
Status     = Done
Show Today = true
```

---

## 14. Data-cleanliness rules

When manually editing a task, clear properties that do not belong to the selected schedule.

### Daily

Keep:

```text
Schedule
Interval (optional)
Repeat Start (only if Interval > 1)
```

Clear:

```text
Repeat On
Repeat Day
Repeat Month
Month End
Due Date
```

### Weekly

Keep:

```text
Schedule
Repeat On
Interval (optional)
Repeat Start (only if Interval > 1)
```

Clear:

```text
Repeat Day
Repeat Month
Month End
Due Date
```

### Monthly specific date

Keep:

```text
Schedule
Repeat Day
```

Clear:

```text
Repeat On
Interval
Repeat Start
Repeat Month
Month End
Due Date
```

### Monthly month-end

Keep:

```text
Schedule
Month End
```

Clear:

```text
Repeat On
Interval
Repeat Start
Repeat Day
Repeat Month
Due Date
```

### Yearly

Keep:

```text
Schedule
Repeat Month
Repeat Day
```

Clear:

```text
Repeat On
Interval
Repeat Start
Month End
Due Date
```

---

## 15. Final compact recurrence model

The final model intentionally avoids overlapping representations.

```text
Schedule
├── Daily
│   └── Interval + Repeat Start (optional)
│
├── Weekly
│   ├── Repeat On
│   └── Interval + Repeat Start (optional)
│
├── Monthly
│   ├── Repeat Day
│   OR
│   └── Month End
│
└── Yearly
    ├── Repeat Month
    └── Repeat Day
```

Supporting formulas:

```text
Recurring
Show Today
```

There is no:

```text
Custom schedule
Repeat Unit
Day-of-month selector
second way to represent monthly dates
```

This keeps the Notion database and the future Office Orbit UI compact and deterministic.

---

## 16. Office Orbit implementation rules for later

When this schema is added to the Worker/client, the UI should be dynamic.

```text
Schedule empty
→ show Due Date
→ hide recurrence fields

Daily
→ hide Due Date
→ optionally show Interval
→ show Repeat Start only when Interval > 1

Weekly
→ hide Due Date
→ show Repeat On
→ optionally show Interval
→ show Repeat Start only when Interval > 1

Monthly
→ hide Due Date
→ show Repeat Day and Month End
→ enforce only one of Repeat Day / Month End

Yearly
→ hide Due Date
→ show Repeat Month + Repeat Day
```

For completed tasks in Office Orbit:

- Keep scheduled recurring tasks visible in Today.
- Keep normal due-today completed tasks visible in Today.
- Render `Done` task titles with strike-through.
- Sort `Done` items after unfinished items.

---

## 17. Quick manual checklist

Before saving a task:

```text
[ ] Is this recurring?
    No  → Schedule empty; Due Date optional.
    Yes → Schedule selected; Due Date empty.

[ ] Daily?
    Interval optional.
    Repeat Start required only when Interval > 1.

[ ] Weekly?
    Repeat On required.
    Interval optional.
    Repeat Start required only when Interval > 1.

[ ] Monthly?
    Use either Repeat Day OR Month End, never both.

[ ] Yearly?
    Repeat Month + Repeat Day required.

[ ] Recurring formula updates automatically.

[ ] Show Today formula updates automatically.
```
