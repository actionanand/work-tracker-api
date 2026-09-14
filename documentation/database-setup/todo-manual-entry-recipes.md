# To Do List — Manual Entry Recipes

Use this document when manually creating or editing rows in the **To Do List** Notion database.

This is a practical companion to:

```text
documentation/database-setup/todo-manual-recurring-setup.md
```

The setup document explains the schema and formulas.  
This document focuses on **exact values to enter for common task patterns**.

---

# 1. Quick rules before entering data

## Normal task

A normal task has:

```text
Schedule = empty
```

`Due Date` is optional.

Examples:

```text
Normal dated task
Schedule = empty
Due Date = 2026-09-20
```

```text
Normal undated task
Schedule = empty
Due Date = empty
```

An open normal task with no Due Date appears in **Today every day until Done**.

---

## Recurring task

A recurring task has:

```text
Schedule = Daily / Weekly / Monthly / Yearly
Due Date = empty
```

Never set a Due Date on a recurring task.

These are calculated automatically:

```text
Recurring
Show Today
```

Do not edit those formula properties manually.

---

# 2. Property reference

Manual-entry properties:

```text
To Do
Status
Due Date
Schedule
Repeat On
Interval
Repeat Day
Repeat Month
Month End
Repeat Start
Notes
Assignee
```

Formula/read-only properties:

```text
Recurring
Show Today
```

---

# 3. Normal task recipes

## Task with a specific Due Date

Example:

```text
Task: Submit monthly report

Status       = Not started
Due Date     = September 20, 2026
Schedule     = empty
Repeat On    = empty
Interval     = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
Repeat Start = empty
```

Expected behavior:

```text
Due Date = Today   → appears in Today
Due Date > Today   → appears in Upcoming
Due Date < Today   → appears in Overdue, if that view exists
```

---

## Task without any Due Date

Example:

```text
Task: Read Angular Signals documentation

Status       = Not started
Due Date     = empty
Schedule     = empty
Repeat On    = empty
Interval     = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
Repeat Start = empty
```

Expected behavior:

```text
Open        → appears in Today every day
Done        → disappears from Today
```

This is the correct pattern for an open-ended task with no deadline.

---

# 4. Daily recurrence recipes

## Every day

```text
Task: Check daily support queue

Status       = Not started
Due Date     = empty

Schedule     = Daily
Interval     = empty
Repeat Start = empty

Repeat On    = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

Equivalent to:

```text
Schedule = Daily
Interval = 1
```

but prefer leaving `Interval` empty for the simplest daily task.

Expected:

```text
Every day → Show Today = checked
```

---

## Every 2 days

```text
Task: Review alternate-day checklist

Status       = Not started
Due Date     = empty

Schedule     = Daily
Interval     = 2
Repeat Start = September 14, 2026

Repeat On    = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

If the anchor is Sep 14:

```text
Sep 14 → show
Sep 15 → hide
Sep 16 → show
Sep 17 → hide
Sep 18 → show
```

`Repeat Start` is required when `Interval > 1`.

---

## Every 3 days

```text
Task: Every 3 days test

Schedule     = Daily
Interval     = 3
Repeat Start = September 14, 2026

Due Date     = empty
Repeat On    = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

---

# 5. Weekly recurrence recipes

## Every Monday

This is the basic weekly example.

```text
Task: Weekly Monday test

Status       = Not started
Due Date     = empty

Schedule     = Weekly
Repeat On    = Monday
Interval     = empty
Repeat Start = empty

Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

Expected:

```text
Monday    → show
Tuesday   → hide
Wednesday → hide
Thursday  → hide
Friday    → hide
Saturday  → hide
Sunday    → hide
```

---

## Every Tuesday and Friday

```text
Task: Tuesday and Friday follow-up

Status       = Not started
Due Date     = empty

Schedule     = Weekly
Repeat On    = Tuesday, Friday
Interval     = empty
Repeat Start = empty

Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

Expected:

```text
Monday    → hide
Tuesday   → show
Wednesday → hide
Thursday  → hide
Friday    → show
Saturday  → hide
Sunday    → hide
```

There is no Custom schedule for this.

Use:

```text
Weekly + Repeat On
```

---

## Every weekday

```text
Task: Weekday checklist

Schedule  = Weekly
Repeat On = Monday, Tuesday, Wednesday, Thursday, Friday

Interval     = empty
Repeat Start = empty
Due Date     = empty

Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

---

## Every 2 weeks on Monday

```text
Task: Fortnightly Monday review

Status       = Not started
Due Date     = empty

Schedule     = Weekly
Repeat On    = Monday
Interval     = 2
Repeat Start = September 14, 2026

Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

With Sep 14 as the anchor:

```text
Sep 14 Monday → show
Sep 21 Monday → hide
Sep 28 Monday → show
Oct 05 Monday → hide
Oct 12 Monday → show
```

---

## Every 2 weeks on Tuesday and Friday

```text
Task: Fortnightly Tuesday-Friday checks

Status       = Not started
Due Date     = empty

Schedule     = Weekly
Repeat On    = Tuesday, Friday
Interval     = 2
Repeat Start = September 14, 2026

Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

The active week is determined from `Repeat Start`.

During an active week:

```text
Tuesday → show
Friday  → show
```

During the alternating week:

```text
Tuesday → hide
Friday  → hide
```

---

# 6. Monthly recurrence recipes

Monthly has exactly two styles:

```text
1. Specific date → use Repeat Day
2. Month-end rule → use Month End
```

Never set both `Repeat Day` and `Month End`.

---

## Every month on the 1st

```text
Task: Monthly first-day checklist

Status       = Not started
Due Date     = empty

Schedule     = Monthly
Repeat Day   = 1
Month End    = empty

Repeat On    = empty
Interval     = empty
Repeat Start = empty
Repeat Month = empty
```

---

## Every month on the 15th

```text
Task: Every month 15th

Status       = Not started
Due Date     = empty

Schedule     = Monthly
Repeat Day   = 15
Month End    = empty

Repeat On    = empty
Interval     = empty
Repeat Start = empty
Repeat Month = empty
```

Expected:

```text
14th → hide
15th → show
16th → hide
```

---

## Every month on the 25th

```text
Task: Monthly payment reminder

Schedule   = Monthly
Repeat Day = 25
Month End  = empty
Due Date   = empty

Repeat On    = empty
Interval     = empty
Repeat Start = empty
Repeat Month = empty
```

This is the only way to represent "every month on the 25th".

Do not create another monthly-rule option for the same behavior.

---

## Last day of every month

```text
Task: Fill time sheet - last day of month

Status       = Not started
Due Date     = empty

Schedule     = Monthly
Repeat Day   = empty
Month End    = Last day

Repeat On    = empty
Interval     = empty
Repeat Start = empty
Repeat Month = empty
```

Expected dates:

```text
January   → 31
February  → 28
March     → 31
April     → 30
May       → 31
June      → 30
July      → 31
August    → 31
September → 30
October   → 31
November  → 30
December  → 31
```

February 29 is intentionally ignored.

---

## Day before the last day of every month

```text
Task: Prepare month-end time sheet

Status       = Not started
Due Date     = empty

Schedule     = Monthly
Repeat Day   = empty
Month End    = Day before last day

Repeat On    = empty
Interval     = empty
Repeat Start = empty
Repeat Month = empty
```

Expected dates:

```text
January   → 30
February  → 27
March     → 30
April     → 29
May       → 30
June      → 29
July      → 30
August    → 30
September → 29
October   → 30
November  → 29
December  → 30
```

---

# 7. Yearly recurrence recipes

A yearly task always uses:

```text
Schedule     = Yearly
Repeat Month = <month>
Repeat Day   = <day>
```

Do not use Month End for Yearly.

---

## Every September 14

```text
Task: Annual September review

Status       = Not started
Due Date     = empty

Schedule     = Yearly
Repeat Month = September
Repeat Day   = 14

Repeat On    = empty
Interval     = empty
Repeat Start = empty
Month End    = empty
```

---

## Every December 25

```text
Task: Annual December reminder

Status       = Not started
Due Date     = empty

Schedule     = Yearly
Repeat Month = December
Repeat Day   = 25

Repeat On    = empty
Interval     = empty
Repeat Start = empty
Month End    = empty
```

Expected:

```text
Dec 25 → show
all other dates → hide
```

---

# 8. Recurring task marked Done

Recurring tasks are schedule-driven.

Example:

```text
Task: Daily checklist

Status   = Done
Schedule = Daily
Due Date = empty
```

If today matches its recurrence:

```text
Show Today = checked
```

So a recurring task may remain in Today even when completed.

This is intentional.

---

# 9. Normal task marked Done

## Normal task due today

```text
Status   = Done
Due Date = Today
Schedule = empty
```

Expected:

```text
Show Today = checked
```

It remains visible for the rest of its Due Date.

---

## Normal undated task

```text
Status   = Done
Due Date = empty
Schedule = empty
```

Expected:

```text
Show Today = unchecked
```

It no longer needs daily attention.

---

# 10. Quick copy/paste recipes

## Normal undated

```text
Task: <title>
Status       = Not started
Due Date     = empty
Schedule     = empty
Repeat On    = empty
Interval     = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
Repeat Start = empty
```

## Normal dated

```text
Task: <title>
Status       = Not started
Due Date     = <date>
Schedule     = empty
Repeat On    = empty
Interval     = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
Repeat Start = empty
```

## Daily

```text
Task: <title>
Schedule     = Daily
Interval     = empty
Repeat Start = empty
Due Date     = empty
Repeat On    = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

## Every N days

```text
Task: <title>
Schedule     = Daily
Interval     = <N>
Repeat Start = <anchor date>
Due Date     = empty
Repeat On    = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

## Weekly

```text
Task: <title>
Schedule     = Weekly
Repeat On    = <weekday(s)>
Interval     = empty
Repeat Start = empty
Due Date     = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

## Every N weeks

```text
Task: <title>
Schedule     = Weekly
Repeat On    = <weekday(s)>
Interval     = <N>
Repeat Start = <anchor date>
Due Date     = empty
Repeat Day   = empty
Repeat Month = empty
Month End    = empty
```

## Monthly specific day

```text
Task: <title>
Schedule     = Monthly
Repeat Day   = <1-31>
Month End    = empty
Due Date     = empty
Repeat On    = empty
Interval     = empty
Repeat Month = empty
Repeat Start = empty
```

## Monthly last day

```text
Task: <title>
Schedule     = Monthly
Month End    = Last day
Repeat Day   = empty
Due Date     = empty
Repeat On    = empty
Interval     = empty
Repeat Month = empty
Repeat Start = empty
```

## Monthly day before last

```text
Task: <title>
Schedule     = Monthly
Month End    = Day before last day
Repeat Day   = empty
Due Date     = empty
Repeat On    = empty
Interval     = empty
Repeat Month = empty
Repeat Start = empty
```

## Yearly

```text
Task: <title>
Schedule     = Yearly
Repeat Month = <month>
Repeat Day   = <day>
Due Date     = empty
Repeat On    = empty
Interval     = empty
Month End    = empty
Repeat Start = empty
```

---

# 11. Invalid combinations to avoid

Do not create these combinations.

## Recurring + Due Date

Wrong:

```text
Schedule = Weekly
Due Date = September 20, 2026
```

Correct:

```text
Schedule = Weekly
Due Date = empty
```

---

## Monthly specific day + Month End together

Wrong:

```text
Schedule   = Monthly
Repeat Day = 15
Month End  = Last day
```

Choose one:

```text
Repeat Day = 15
Month End  = empty
```

or:

```text
Repeat Day = empty
Month End  = Last day
```

---

## Interval greater than 1 without Repeat Start

Wrong:

```text
Schedule     = Weekly
Interval     = 2
Repeat Start = empty
```

Correct:

```text
Schedule     = Weekly
Interval     = 2
Repeat Start = <anchor date>
```

---

## Weekly without Repeat On

Wrong:

```text
Schedule  = Weekly
Repeat On = empty
```

Correct:

```text
Schedule  = Weekly
Repeat On = Monday
```

or:

```text
Schedule  = Weekly
Repeat On = Tuesday, Friday
```

---

## Yearly without month/day

Wrong:

```text
Schedule     = Yearly
Repeat Month = empty
Repeat Day   = empty
```

Correct:

```text
Schedule     = Yearly
Repeat Month = December
Repeat Day   = 25
```

---

# 12. Field-cleanup cheat sheet

When changing a task from one recurrence type to another, clear old fields.

| Type | Keep | Clear |
|---|---|---|
| Normal | Due Date optional | All recurrence fields |
| Daily | Schedule; optional Interval/Repeat Start | Repeat On, Repeat Day, Repeat Month, Month End, Due Date |
| Weekly | Schedule, Repeat On; optional Interval/Repeat Start | Repeat Day, Repeat Month, Month End, Due Date |
| Monthly specific | Schedule, Repeat Day | Repeat On, Interval, Repeat Start, Repeat Month, Month End, Due Date |
| Monthly month-end | Schedule, Month End | Repeat On, Interval, Repeat Start, Repeat Day, Repeat Month, Due Date |
| Yearly | Schedule, Repeat Month, Repeat Day | Repeat On, Interval, Repeat Start, Month End, Due Date |

---

# 13. Quick validation after manual entry

After entering a task, check:

```text
1. Recurring
2. Show Today
```

Examples:

```text
Schedule = Weekly
→ Recurring should be checked
```

```text
Schedule = empty
→ Recurring should be unchecked
```

If the schedule matches today:

```text
Show Today should be checked
```

If it does not match:

```text
Show Today should be unchecked
```

Do not manually change either formula result.

---

# 14. Recommended manual-entry workflow

When creating a task manually:

```text
1. Enter To Do title.
2. Set Status.
3. Decide: normal or recurring?
4. If normal:
     - leave Schedule empty
     - optionally set Due Date
5. If recurring:
     - set Due Date empty
     - choose Schedule
     - fill only the properties required by that Schedule
6. Clear unrelated recurrence properties.
7. Verify Recurring formula.
8. Verify Show Today formula.
```

This keeps the database clean and prevents ambiguous recurrence definitions.
