# Release API

This document describes the currently implemented Release Items read API.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/releases` | Query all Release Items from the configured Notion Release Items data source. |
| `GET` | `/api/releases/pending` | Query Release Items pending confirmation. |
| `GET` | `/api/releases/confirmed` | Query confirmed Release Items. |
| `GET` | `/api/releases/not-announced` | Query Release Items that have not been formally announced. |

Unknown paths such as `/api/releases/random` or `/api/releases/foo/bar` are not handled by `handleReleaseRoutes()` and fall through to the main Worker 404.

## State Definitions

| State | Notion Filter Semantics |
| --- | --- |
| Pending Confirmation | `Formal Announced Date` exists and `Confirmed Release Date` is empty. |
| Confirmed | `Confirmed Release Date` exists. |
| Not Announced | `Formal Announced Date` is empty. |

## Query Parameters

Release endpoints support:

| Query Parameter | Notion Filter Semantics |
| --- | --- |
| `jiraId=<jira-page-id>` | `JIRAs` relation contains the supplied JIRA page ID. |
| `deploymentType=<select-value>` | `Deployment Type` select equals the supplied value. |
| `component=<text>` | `Component Name` text contains the supplied value. |
| `from=YYYY-MM-DD` | `Formal Announced Date` is on or after the supplied date. |
| `to=YYYY-MM-DD` | `Formal Announced Date` is on or before the supplied date. |

Multiple supported filters are composed with Notion `and`. Filtering is performed by Notion, not by fetching all Release Items and filtering in JavaScript.

`jiraId` must be a valid Notion page ID. Invalid IDs return HTTP 400 before Notion is called. Date parameters must use `YYYY-MM-DD`.

Release Items are sorted in Notion. Default, pending, and not-announced responses sort by `Formal Announced Date` descending. Confirmed responses sort by `Confirmed Release Date` descending.

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

## Mapped Release Item Fields

Each mapped Release Item can include:

```text
id
createdTime
lastEditedTime
releaseItem
componentName
deploymentType
versionNumber
branch
formalAnnouncedDate
confirmedReleaseDate
notes
jiraIds
jiraStatuses
sprintIds
spilloverCount
```

Title, rich text, and select values are trimmed. `versionNumber` is intentionally represented as a string because valid values can contain dots, hashes, hyphens, prefixes, and other non-numeric content.

Missing text defaults to an empty string. Missing select/date values default to `null`. Missing relation and rollup collections default to empty arrays. Missing numeric rollups default to `0`.

When `include=relations` is supplied, Release endpoints also include shallow `jiras` and `sprints` arrays. Raw relation ID arrays remain unchanged.

## Release History

One JIRA can have multiple Release Items because a ticket can release multiple components or micro-frontends.

TAR information remains in `notes`. There is no TAR Required API field or database field in this implementation.

## Not Implemented

The following are not implemented in this feature:

- Release Item create/update/delete APIs
- `/api/releases/:id`
- Dashboard API
- caching
- Android authentication

## Related Docs

- [Architecture](architecture.md)
- [JIRA API](jira-api.md)
- [Sprint API](sprint-api.md)
- [Work Log API](work-log-api.md)
- [Relation Enrichment](relation-enrichment.md)
- [Notion Integration](notion-integration.md)
