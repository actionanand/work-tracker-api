# Alter Controls API

The authenticated Worker owns two independent temporary write controls: **Alter Sprint** and **Alter Release Management**. They are persisted in `AUTH_DB` D1, so reopening Settings or using another device reads the same backend state. The confirmation popup belongs to Office Orbit; this API does not implement UI.

## Read and Change Controls

`GET /api/settings/alter-controls` returns:

```json
{
  "data": {
    "alterSprint": {
      "enabled": true,
      "activeUntil": "2026-10-13T14:30:00.000Z",
      "remainingSeconds": 1740
    },
    "alterReleaseManagement": {
      "enabled": false,
      "activeUntil": null,
      "remainingSeconds": 0
    },
    "ttlSeconds": 1800,
    "serverTime": "2026-10-13T14:01:00.000Z"
  }
}
```

`PATCH /api/settings/alter-controls` accepts only:

```json
{ "control": "sprint", "enabled": true }
```

Use `"releaseManagement"` for the other control. Both GET and PATCH use `Cache-Control: no-store`. PATCH returns the same settings envelope.

Every enable starts a fresh 30-minute window from server time, including an enable while already ON. Disable sets only the selected expiry to `NULL`; enabling after disabling starts a new window. GET preserves an unexpired stored timestamp and returns the remaining time. A missing row means both controls are OFF.

An expiry at or before server time is OFF, with `activeUntil: null` and `remainingSeconds: 0`, even when the expired timestamp remains in D1. Every protected mutation checks the backend expiry. There is no Cron Trigger, scheduled Worker, alarm or cleanup job.

## Write Gates

| Control | Protected mutations |
| --- | --- |
| Alter Sprint | `POST /api/sprints`, `PATCH /api/sprints/:id`, `PATCH /api/jiras/:jiraKey/current-sprint`, `PATCH /api/sprint-allocations/:id` |
| Alter Release Management | `POST /api/releases`, `PATCH /api/releases/:id`, `DELETE /api/releases/:id`, `PATCH /api/releases/bulk-date` |

Reads remain available with controls OFF. Existing `POST /api/jiras`, including `inActiveSprint: true`, is unchanged and does **not** require Alter Sprint. JIRA description and spill-reason edits retain their existing contracts.

Disabled or expired controls return `403`:

```json
{ "error": "Alter Sprint is disabled", "code": "ALTER_SPRINT_DISABLED" }
```

```json
{ "error": "Alter Release Management is disabled", "code": "ALTER_RELEASE_MANAGEMENT_DISABLED" }
```

## Migration

Apply `migrations/0003_alter_controls.sql` to the existing auth database before using these APIs. It creates a singleton `alter_controls` table with nullable Unix-second expiries (`alter_sprint_enabled_until`, `alter_release_enabled_until`) and `updated_at`. No initial row is required.

```bash
npx wrangler d1 migrations apply work-tracker-auth --local
npx wrangler d1 migrations apply work-tracker-auth --remote
```

The API does not expose stored D1 rows or secrets. See [Sprint API](sprint-api.md) and [Release API](release-api.md) for write constraints and Notion partial-write limitations.
