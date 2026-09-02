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

The Worker currently queries Notion data sources with:

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

The shared Notion client currently sends:

```json
{
  "page_size": 100
}
```

For filtered endpoints, it adds a `filter` object:

```json
{
  "page_size": 100,
  "filter": {}
}
```

The actual filter object is defined in the relevant feature's `*.filters.ts` file.

## Relation Properties

Notion relation properties often return related page IDs rather than human-readable titles. The current JIRA mapper returns those IDs directly as arrays such as `sprintIds` and `projectIds`.

Resolving relation names would require additional Notion lookups. That is intentionally deferred.

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

The current client sends `page_size: 100`. Future pagination work may add cursor parameters to API endpoints, but that is not implemented yet.

## Related Docs

- [JIRA API](jira-api.md)
- [Environment Variables and Secrets](../documentation/03-environment-variables-and-secrets.md)
- [Security](../documentation/07-security.md)
