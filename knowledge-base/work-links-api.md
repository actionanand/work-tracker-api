# Work Links API

This document describes the currently implemented Work Links read API.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/work-links` | Query all Work Links from the configured Notion Work Links data source. |
| `GET` | `/api/work-links/active` | Query active Work Links. |

Unknown paths such as `/api/work-links/random` or `/api/work-links/foo/bar` are not handled by `handleWorkLinkRoutes()` and fall through to the main Worker 404.

Inactive links remain available through `/api/work-links`. `/api/work-links/active` is intended for normal application usage.

## Query Parameters

Work Link endpoints support:

| Query Parameter | Notion Filter Semantics |
| --- | --- |
| `companyId=<company-page-id>` | `Company` relation contains the supplied Company page ID. |
| `projectId=<project-page-id>` | `Project` relation contains the supplied Project page ID. |
| `type=<select-value>` | `Type` select equals the supplied value. |
| `q=<text>` | `Link` title contains the supplied text. |

Multiple supported filters are composed with Notion `and`. Filtering is performed by Notion, not by fetching all Work Links and filtering in JavaScript.

`companyId` and `projectId` must be valid Notion page IDs. Invalid IDs return HTTP 400 before Notion is called.

Work Links are sorted by `Link` ascending using the Notion query API.

## Response Shape

Collection endpoints return:

```json
{
  "data": [],
  "count": 0,
  "hasMore": false,
  "nextCursor": null
}
```

## Mapped Work Link Fields

Each mapped Work Link can include:

```text
id
createdTime
lastEditedTime
link
type
url
notes
active
companyIds
projectIds
```

Title, rich text, and select values are trimmed. Missing text defaults to an empty string. Missing select and URL values default to `null`. Missing checkbox values default to `false`. Missing relations default to empty arrays.

Work Links are reference or bookmark entries optionally associated with Company and Project records. Company and Project are returned as Notion relation IDs by default. External URLs are treated only as stored data and are not fetched by the Worker.

When `include=relations` is supplied, Work Link endpoints also include shallow `companies` and `projects` arrays. Raw relation ID arrays remain unchanged.

## Not Implemented

The following are not implemented in this feature:

- Work Link create/update/delete APIs
- `/api/work-links/:id`
- nested Company/Project objects
- Dashboard API
- caching
- Android authentication
- Notion write APIs

## Related Docs

- [Architecture](architecture.md)
- [Company, Team, and Project API](company-team-project-api.md)
- [Feedback API](feedback-api.md)
- [Relation Enrichment](relation-enrichment.md)
- [Notion Integration](notion-integration.md)
