# To Do API

The To Do API exposes the configured Notion To Dos data source through protected Work Tracker routes.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/todos/meta` | Field metadata and writable option IDs. |
| `GET` | `/api/todos` | Paginated list. |
| `QUERY` | `/api/todos` | JSON-body read query with Notion-side filters. |
| `POST` | `/api/todos` | Create a To Do. |
| `PATCH` | `/api/todos/:pageId` | Update an owned To Do page. |
| `DELETE` | `/api/todos/:pageId` | Move an owned To Do page to Notion trash. |
| `POST` | `/api/todos/bulk-delete` | Move a validated batch of To Do pages to Notion trash. |

## Model

```json
{
  "id": "...",
  "createdTime": "...",
  "lastEditedTime": "...",
  "toDo": "Send update",
  "status": "In progress",
  "dueDate": "2026-09-13",
  "notes": "Before standup"
}
```

## QUERY Filters

`statuses`, `dueFrom`, `dueTo`, `dueBefore`, `dueOnOrBefore`, and `q` are supported. Filters are translated to Notion data-source filters; the Worker does not fetch all To Dos and filter locally.

## Writes

Writable fields are `toDo`, `statusOptionId`, `dueDate`, and `notes`. Statuses are written by option ID from `/api/todos/meta`, not by hardcoded option IDs.
