# Notion Integration

This document describes the current Notion integration used by the Work Tracker API.

## Base URL

The Notion REST API base URL is:

```text
https://api.notion.com
```

## API Version

The current Notion API version used by source code is:

```text
2026-03-11
```

It is defined in `src/shared/notion/notion-client.ts`.

## Querying Approach

The Worker queries Notion data sources with:

```http
POST /v1/data_sources/{data_source_id}/query
```

The request includes:

```http
Authorization: Bearer <token>
Notion-Version: 2026-03-11
Content-Type: application/json
```

Never write the real token into source code, configuration, documentation, or client applications.

## Database ID Versus Data Source ID

At a high level, a Notion database describes a collection of data. A data source is the queryable source of pages/rows that the API endpoint targets.

This project uses Data Source IDs for querying rows.

## Authentication

Authentication uses a Notion Personal Access Token through a bearer token header:

```http
Authorization: Bearer <token>
```

The Worker reads this token from:

```ts
env.NOTION_TOKEN
```

## Request Body

For public list endpoints, the shared Notion client sends:

```json
{
  "page_size": 25
}
```

For filtered endpoints, it adds a `filter` object:

```json
{
  "page_size": 25,
  "filter": {}
}
```

The actual filter object is defined in the relevant feature's `*.filters.ts` file.

For supported `QUERY` endpoints, clients send domain filters in a JSON request body. The Worker validates those fields and translates them to Notion filter JSON; clients do not send raw Notion filters.

## Data Source Schema Reads

Metadata endpoints and write endpoints read Notion data-source schemas with:

```http
GET /v1/data_sources/{data_source_id}
```

Metadata endpoints normalize writable fields and select option IDs for clients. Write endpoints validate submitted option IDs against the current schema before creating or updating pages.
Status, select, and multi-select option IDs are all validated against live schema metadata before writes. Status properties are written with Notion `status` payloads, not `select` payloads.

## Page Writes

Selected resources create and update Notion pages through:

```http
POST /v1/pages
PATCH /v1/pages/{page_id}
```

The Worker builds Notion page properties from allow-listed API fields. It does not forward arbitrary client JSON. `PATCH` first retrieves the target page and verifies that it belongs to the expected data source before sending an update.

Delete endpoints use Notion page trashing:

```http
PATCH /v1/pages/{page_id}
```

with `in_trash: true`. The Worker validates page ownership before trashing pages.

## Markdown Page Content

Memo detail and Reference Library detail endpoints read page-body markdown through Notion's markdown page APIs. Memo writes can update page-body markdown separately from the Memo data-source properties.

Reference Library imports create normal child pages under `REFERENCE_LIBRARY_PAGE_ID` using markdown text, not Notion file attachments. When Notion returns an async task for markdown creation, the Worker exposes a normalized polling endpoint.

## Block Children

Reference Library listing uses:

```http
GET /v1/blocks/{block_id}/children
```

Only direct `child_page` blocks are returned by the API. Detail reads verify that the requested page's parent is the configured Reference Library page before returning markdown.

## Relation Properties

Notion relation properties often return related page IDs rather than human-readable titles. The current JIRA mapper returns those IDs directly as arrays such as `sprintIds` and `projectIds`.

Selected endpoints can resolve shallow relation names with `include=relations`; otherwise relation IDs remain raw Notion page IDs.

## Why Mapping Happens in the Worker

Mapping raw Notion responses in the Worker:

- keeps Notion-specific nested property shapes out of the Angular app
- creates a stable API contract for the client
- centralizes fallback behavior for missing fields
- makes future backend changes easier

## Pagination

Notion query responses include:

```text
has_more
next_cursor
```

The service response converts these to:

```text
hasMore
nextCursor
```

List endpoints support `pageSize` and `cursor` parameters. `pageSize` defaults to `25` and maxes at `100`. Cursors are opaque Notion cursors and are passed through as `nextCursor`.

## CORS And QUERY

Preflight responses include `QUERY` in `Access-Control-Allow-Methods`. Resources that support HTTP QUERY return `Accept-Query: application/json`; metadata endpoints and Reference Library endpoints do not.

## Related Docs

- [JIRA API](jira-api.md)
- [HTTP QUERY Method](http-query-method.md)
- [To Do API](todo-api.md)
- [Task API](task-api.md)
- [Memo API](memo-api.md)
- [Reference Library API](reference-library-api.md)
- [Environment Variables and Secrets](../documentation/03-environment-variables-and-secrets.md)
- [Security](../documentation/07-security.md)
