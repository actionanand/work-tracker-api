# Memo API

The Memo API exposes the configured Notion Memos data source. Memo metadata lives in Notion properties; Memo content lives in the Notion page body as markdown.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/memos/meta` | Field metadata and writable option IDs. |
| `GET` | `/api/memos` | Paginated list without body markdown. |
| `QUERY` | `/api/memos` | JSON-body read query with Notion-side filters. |
| `GET` | `/api/memos/:pageId` | Detail response including markdown. |
| `POST` | `/api/memos` | Create a Memo and optional markdown body. |
| `PATCH` | `/api/memos/:pageId` | Update properties and optional markdown body. |
| `DELETE` | `/api/memos/:pageId` | Move an owned Memo page to Notion trash. |
| `POST` | `/api/memos/bulk-delete` | Move a validated batch of Memo pages to Notion trash. |

## QUERY Filters

Supported filters are `categories`, `tags`, `pinned`, and `q`. Multiple tags are OR semantics.

## Writes

Writable fields are `memo`, `categoryOptionId`, `tagOptionIds`, `pinned`, and `markdown`. `markdown` is written to the Notion page body, not to a rich text property.
