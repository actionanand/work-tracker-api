# Task API

The Task API exposes Tasks and follow-ups from the configured Notion Tasks data source.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/tasks/meta` | Field metadata and writable option IDs. |
| `GET` | `/api/tasks` | Paginated list. Supports `include=relations`. |
| `QUERY` | `/api/tasks` | JSON-body read query with Notion-side filters. |
| `POST` | `/api/tasks` | Create a Task. |
| `PATCH` | `/api/tasks/:pageId` | Update an owned Task page. |
| `DELETE` | `/api/tasks/:pageId` | Move an owned Task page to Notion trash. |
| `POST` | `/api/tasks/bulk-delete` | Move a validated batch of Task pages to Notion trash. |

## Model

Task responses include title, status, priority, responsibility, requested/assigned fields, due/follow-up/completed dates, raw `companyIds`, raw `jiraIds`, notes, and outcome/update text.

When `include=relations` or `includeRelations: true` is used, the response also includes shallow `companies` and `jiras` arrays while preserving the raw ID arrays.

## QUERY Filters

Supported filters are `statuses`, `priorities`, `responsibilities`, `requestedByTypes`, `assignedToTypes`, `companyIds`, `jiraIds`, due-date filters, follow-up-date filters, completed-date filters, and `q`.

All relation IDs must be valid Notion page IDs. Filtering is performed by Notion.

## Writes

Writable option fields use option IDs from `/api/tasks/meta`: `statusOptionId`, `priorityOptionId`, `responsibilityOptionId`, `requestedByTypeOptionId`, and `assignedToTypeOptionId`.
