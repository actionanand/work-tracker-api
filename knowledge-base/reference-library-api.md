# Reference Library API

The Reference Library API exposes article rows from the Notion data source configured by `REFERENCE_LIBRARY_DATA_SOURCE_ID`. Article metadata lives in data-source properties, while article content remains in the Notion page body as Markdown.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/reference-library/meta` | Live field metadata and Category/Tags option IDs. |
| `GET` | `/api/reference-library` | Paginated lightweight article list. |
| `QUERY` | `/api/reference-library` | JSON-body read query with Notion-side filters. |
| `GET` | `/api/reference-library/:pageId` | Article metadata and page-body Markdown. The page must belong to the configured data source. |
| `POST` | `/api/reference-library/import` | Import a `.md` or `.markdown` file as an article row. |
| `GET` | `/api/reference-library/imports/:taskId` | Poll async Markdown import status. |

Reference Library does not support article PATCH, DELETE, bulk delete, or a normal JSON create endpoint.

## List And QUERY

Lists return `article`, `category`, `tags`, `createdTime`, and `lastEditedTime` without retrieving page-body Markdown. Results default to 25 items, support opaque cursor pagination up to 100 items, and are sorted by `Last Edited` descending in Notion.

`QUERY /api/reference-library` accepts `categories`, `tags`, and `q`. Values within `categories` or `tags` use OR semantics; different filter families combine with AND. `q` searches the `Article` title. GET, QUERY, and OPTIONS collection responses advertise `Accept-Query: application/json`.

## Import Rules

Imports use `multipart/form-data` with a required `file` field and optional `article`, `categoryOptionId`, and repeatable `tagOptionIds` fields. If `article` is omitted, the sanitized filename stem is used. Category and Tag IDs must come from `/api/reference-library/meta` and are validated against the live Notion schema.

Files must be non-empty `.md` or `.markdown` files no larger than `4,500,000` bytes. Markdown is sent unchanged to Notion, including Mermaid fences and LaTeX/math syntax. If Notion accepts creation asynchronously, the API returns HTTP 202 with `taskId` and `pollAfterSeconds`.

## Markdown Reads

Detail reads convert standalone Notion `<empty-block/>` lines into blank lines for display. Tokens inside backtick or tilde fenced code blocks, inline tokens, Mermaid, math, and other enhanced-Markdown constructs remain unchanged.
