# Release API

This document describes the Release Items read and managed write APIs.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/releases` | Query all Release Items from the configured Notion Release Items data source. |
| `GET` | `/api/releases/pending` | Query Release Items pending confirmation. |
| `GET` | `/api/releases/confirmed` | Query confirmed Release Items. |
| `GET` | `/api/releases/not-announced` | Query Release Items that have not been formally announced. |
| `PATCH` | `/api/releases/bulk-date` | Set one Formal Announced Date or Confirmed Release Date across selected Release Items. |
| `GET` | `/api/releases/calendar` | Discover Release Item counts by announcement or release date in a bounded range. |
| `GET` | `/api/releases/by-date` | Query Release Items for one exact announcement or release date. |
| `GET` | `/api/releases/meta` | Live metadata for writable Release fields and Deployment Type options. |
| `POST` | `/api/releases` | Create a Release Item for an existing JIRA. |
| `PATCH` | `/api/releases/:releaseItemId` | Edit an unconfirmed Release Item. |
| `DELETE` | `/api/releases/:releaseItemId` | Trash an unconfirmed Release Item. |

## Managed Release Writes

Create, edit, delete and bulk-date mutations require backend [Alter Release Management](alter-controls-api.md) to be enabled and unexpired. Read APIs and metadata work with the control OFF. Mutation responses use `Cache-Control: no-store`.

`GET /api/releases/meta` uses live datasource metadata for componentName, deploymentTypeOptionId, versionNumber, branch, formalAnnouncedDate, confirmedReleaseDate and notes. Deployment Type exposes option ID, name and color; writes submit an ID.

```http
POST /api/releases
```

```json
{
  "jiraId": "55555555-5555-5555-5555-555555555555",
  "componentName": "cortellis-frontend",
  "deploymentTypeOptionId": "deploy-option-id",
  "versionNumber": "2a19386-115",
  "branch": "master",
  "formalAnnouncedDate": "2026-10-13",
  "confirmedReleaseDate": null,
  "notes": "Optional notes"
}
```

JIRA ID and trimmed non-empty componentName are required. The JIRA page must exist in the JIRAs datasource. The Release Items title is derived from its JIRA key; JIRAs contains the JIRA ID. Deployment Type is optional/null and validated against live select IDs. Version, branch and notes default to empty strings; dates are optional/null real `YYYY-MM-DD` values. Only those properties are written, with no formula or rollup writes. Success is `201 { "data": <mapped Release Item> }`.

Multiple components and repeated releases of the same component for the same JIRA are intentional. No uniqueness constraint is introduced. Existing releaseItemIds and JiraDetail.releaseItemCount remain the source for counts.

`PATCH /api/releases/:releaseItemId` accepts a non-empty subset of the seven metadata fields. Title, JIRAs relation and derived fields are read-only. Success is `200 { "data": <mapped Release Item> }`.

The Worker retrieves and verifies the current page before editing or deleting. A non-null Confirmed Release Date locks **all** future mutations, including clearing that date:

```json
{ "error": "Confirmed Release Items are read-only", "code": "RELEASE_ITEM_CONFIRMED" }
```

This returns `409` for actual changes. An unconfirmed item may receive an initial confirmation date; it is locked afterward. An exact PATCH replay against all supplied writable values returns the current item successfully without a Notion PATCH, including a retry of the confirmation request. Deployment Type is compared by its raw option ID, not its display name. Changing any supplied value or clearing confirmation remains blocked. `DELETE /api/releases/:releaseItemId` uses the Notion trash operation and returns `204` with no body. There is no bulk Release delete API.

Individual writes and batch preflight are not atomic with external Notion edits; another writer can change confirmation state between preflight and mutation. Notion-derived values may briefly lag successful writes.

## Batch Dates And Calendar

`PATCH /api/releases/bulk-date` accepts `releaseItemIds`, `dateType` (`announcement` or `release`), and a `YYYY-MM-DD` date. Every selected Release Item is preflighted before updates begin. A target already equal to the requested date is a successful no-op and is not written again. Mixed batches update only rows that still need the value. A different existing announcement date on an unconfirmed item returns `409` / `RELEASE_DATE_CONFLICT` before any mutation. Notion multi-page writes are not transactional: an infrastructure failure after updates begin is returned as a safe partial result, and a retry skips completed rows.

The batch requires Alter Release Management even for an entirely satisfied replay. A confirmed item whose target differs from the requested value returns `409` / `RELEASE_ITEM_CONFIRMED` with `conflicts` before any mutation, for either dateType. An exact no-op is allowed even on a confirmed item. Unconfirmed rows can still be confirmed in bulk and are locked for later real changes. The response shape is unchanged: `data`, `updated` and partial-result `updatedIds` include successfully satisfied rows, including no-ops; `allSucceeded` is true when every requested row is satisfied. Disabled or expired controls still reject individual and bulk replay requests with `403`.

`GET /api/releases/calendar?dateType=announcement&from=2026-10-01&to=2026-10-31` returns sorted dates and Release Item counts. Ranges are limited to 366 days. `GET /api/releases/by-date?dateType=release&date=2026-10-15&include=relations` supports shared pagination and relation enrichment. Existing `/api/releases?from&to` continues to filter Formal Announced Date.

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

Release collection endpoints support shared server-side pagination with `pageSize` and `cursor`. `pageSize` defaults to `25` and maxes at `100`; `count` is the current page size, not a total. Cursors are opaque and should be discarded when filters or views change.

Release Items are sorted in Notion. Default, pending, and not-announced responses sort by `Formal Announced Date` descending. Confirmed responses sort by `Confirmed Release Date` descending.

## Response Shape

## JIRA Detail History

`GET /api/jiras/:jiraKey?include=relations` includes every related Release Item in `releaseItems`, with `releaseItemCount`. Items are historical data and remain available for older JIRAs. They are ordered by confirmed release date, then formal announced date, then creation time and ID.

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

- Release bulk delete APIs
- caching
- Android authentication

## Related Docs

- [Architecture](architecture.md)
- [JIRA API](jira-api.md)
- [Sprint API](sprint-api.md)
- [Work Log API](work-log-api.md)
- [Relation Enrichment](relation-enrichment.md)
- [Notion Integration](notion-integration.md)
