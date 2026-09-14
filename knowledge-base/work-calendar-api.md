# Work Calendar API

The protected work-calendar settings API stores weekly week-off days in the existing `AUTH_DB` D1 database. It does not fetch holidays or calculate adjusted Todo dates.

## Contract

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/settings/work-calendar` | Read week-off days. |
| `PATCH` | `/api/settings/work-calendar` | Replace week-off days. |

With no stored row, GET returns:

```json
{
  "data": {
    "weekOffDays": ["Saturday", "Sunday"]
  }
}
```

PATCH accepts only `weekOffDays`. It must be an array of unique exact weekday names. An empty array is valid; all seven weekdays are rejected because at least one working day is required. Responses are ordered Monday through Sunday and use `Cache-Control: no-store`.

```json
{
  "weekOffDays": ["Friday", "Saturday"]
}
```

## Migration

Apply D1 migrations before PATCH or deployment usage:

```bash
npx wrangler d1 migrations apply work-tracker-auth --local
npx wrangler d1 migrations apply work-tracker-auth --remote
```

The migration creates one singleton `work_calendar_settings` row location. GET can return the default before a row exists.

## Responsibility Boundary

Office Orbit combines these week-off days with Google Sheets holiday events and Todo recurrence data. Holiday retrieval and previous-working-day traversal do not run in this Worker.
