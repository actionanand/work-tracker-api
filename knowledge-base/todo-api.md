# To Do API

The protected To Do API exposes the configured Notion data source with cursor pagination, recurrence-aware writes, and Notion-side filtering.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/todos/meta` | Field metadata and live writable option IDs. |
| `GET` | `/api/todos` | Paginated list. |
| `QUERY` | `/api/todos` | JSON-body query with Notion-side filters. |
| `POST` | `/api/todos` | Create a validated To Do. |
| `PATCH` | `/api/todos/:pageId` | Validate and update the final state of an owned page. |
| `DELETE` | `/api/todos/:pageId` | Move an owned page to Notion trash. |
| `POST` | `/api/todos/bulk-delete` | Move a validated batch to Notion trash. |

## Response

```json
{
  "id": "...",
  "createdTime": "2026-09-14T08:00:00.000Z",
  "lastEditedTime": "2026-09-14T09:00:00.000Z",
  "toDo": "Weekly report",
  "status": "Not started",
  "dueDate": null,
  "notes": "",
  "schedule": "Weekly",
  "repeatOn": ["Tuesday", "Friday"],
  "interval": 2,
  "repeatDay": null,
  "repeatMonth": null,
  "monthEnd": null,
  "repeatStart": "2026-09-14",
  "workdayAdjust": true,
  "recurring": true,
  "showToday": false,
  "setupIssue": ""
}
```

`Recurring`, `Show Today`, and `Setup Issue` are read-only Notion formula results. The Worker maps them but never writes or recalculates them.

## Writes

```json
{
  "toDo": "Weekly report",
  "statusOptionId": "...",
  "dueDate": null,
  "notes": "",
  "scheduleOptionId": "...",
  "repeatOnOptionIds": ["...", "..."],
  "interval": 2,
  "repeatDay": null,
  "repeatMonthOptionId": null,
  "monthEndOptionId": null,
  "repeatStart": "2026-09-14",
  "workdayAdjust": true
}
```

Status, Schedule, Repeat On, Repeat Month, and Month End are written using option IDs returned by `/api/todos/meta`. Use `null` for empty scalar values and `[]` to clear Repeat On.

PATCH loads the existing page, applies supplied changes, normalizes a changed Schedule, and validates the resulting complete state before calling Notion. Removing Schedule clears all recurrence fields and disables Workday Adjust. Changing from normal to recurring clears an existing Due Date unless a non-null Due Date was explicitly supplied, which is rejected.

## Recurrence Rules

- Normal: Schedule is empty, Due Date is optional, recurrence fields are empty, and Workday Adjust is false.
- Daily: optional integer Interval; Repeat Start is required exactly when Interval is greater than 1.
- Weekly: one or more Monday-Sunday Repeat On values; optional Interval follows the Daily anchor rule.
- Monthly: exactly one of Repeat Day `1-31` or Month End (`Last day` or `Day before last day`).
- Yearly: Repeat Month and a valid Repeat Day are required. February ends at 28; April, June, September, and November end at 30.
- Recurring Todos cannot have Due Date. Workday Adjust is a manual flag allowed only for recurring Todos.

The full manual-entry model and examples are in [Todo manual recurring setup](../documentation/database-setup/todo-manual-recurring-setup.md).

## QUERY Filters

Supported filters are `statuses`, `dueFrom`, `dueTo`, `dueBefore`, `dueOnOrBefore`, `q`, `schedules`, `recurring`, `showToday`, `workdayAdjust`, and `hasSetupIssue`. Filter families combine with AND; multiple schedules or statuses combine with OR. All filtering occurs in Notion before pagination.

```json
{
  "filters": {
    "showToday": true
  }
}
```

Today intentionally applies no implicit Status filter. Useful additional queries include `{"recurring":true}`, `{"hasSetupIssue":true}`, and `{"recurring":true,"workdayAdjust":true}`.
