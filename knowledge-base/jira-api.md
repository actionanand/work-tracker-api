# JIRA API

This document describes the JIRA API functionality currently implemented in the Work Tracker API.

## Current Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/jiras` | Query all JIRAs from the Notion JIRAs data source. |
| `GET` | `/api/jiras/active` | Query active sprint JIRAs. |
| `GET` | `/api/jiras/blocked` | Query active sprint JIRAs with blocked status. |
| `GET` | `/api/jiras/spillovers` | Query active sprint spillover JIRAs. |
| `GET` | `/api/jiras/appraisal` | Query JIRAs marked for appraisal. |
| `GET` | `/api/jiras/demo-pending` | Query JIRAs requiring a demo with no demo date. |
| `GET` | `/api/jiras/demoed` | Query JIRAs with a demo date. |
| `GET` | `/api/jiras/:jiraKey` | Query one JIRA by its `JIRA Key` title property. |
| `QUERY` | `/api/jiras` | Query JIRAs with a JSON request body and Notion-side filters. |

Static JIRA routes are matched before dynamic JIRA key lookup. Unknown paths such as `/api/jiras/random` are not handled by `handleJiraRoutes()` and fall through to the main Worker 404.

## Response Shape

All JIRA list endpoints return:

```json
{
  "data": [],
  "count": 0,
  "hasMore": false,
  "nextCursor": null
}
```

`GET /api/jiras/:jiraKey` returns a single mapped JIRA object instead of the collection wrapper.

JIRA list endpoints support shared server-side pagination with `pageSize` and `cursor`. `pageSize` defaults to `25` and maxes at `100`; `count` is the current page size, not a total. Cursors are opaque and should be discarded when filters or views change. `GET /api/jiras/:jiraKey` is not paginated.

If no matching JIRA exists, the endpoint returns:

```json
{
  "error": "JIRA not found"
}
```

with HTTP 404.

If Notion returns more than one row for the same JIRA Key, the endpoint returns HTTP 500 instead of silently choosing one row.

## Filter Semantics

Filtering is performed in the Notion data-source query request, not by filtering an already-fetched array in JavaScript.

| Endpoint | Notion Filter Semantics |
| --- | --- |
| `/api/jiras/active` | `In Active Sprint = true` |
| `/api/jiras/blocked` | `In Active Sprint = true AND Status = Blocked` |
| `/api/jiras/spillovers` | `In Active Sprint = true AND Spillover = true` |
| `/api/jiras/appraisal` | `Appraisal = true` |
| `/api/jiras/demo-pending` | `Demo Required = true AND Demoed Date is empty` |
| `/api/jiras/demoed` | `Demoed Date is not empty` |
| `/api/jiras/:jiraKey` | `JIRA Key = :jiraKey` |

`In Active Sprint` and `Spillover` are Notion formula values returning booleans.

## HTTP QUERY

`QUERY /api/jiras` accepts `Content-Type: application/json` and supports:

```json
{
  "filters": {
    "statuses": ["In progress", "Cancelled"],
    "tags": ["api"],
    "sprintIds": ["sprint-page-id"],
    "inActiveSprint": true,
    "spillover": false,
    "appraisal": true,
    "demoRequired": false,
    "q": "CRI-1234"
  },
  "pageSize": 25,
  "cursor": "opaque-cursor",
  "includeRelations": false
}
```

Multiple values for one field are composed with Notion `or`. Different fields are composed with Notion `and`. Unknown top-level fields or filter names return HTTP 400 before Notion is called. `sprintIds` must contain valid Notion page IDs.

## Mapped JIRA Fields

Each mapped JIRA can include:

```text
id
createdTime
lastEditedTime
jiraKey
summary
status
tags
appraisal
spillover
spilloverCount
spilloverReason
inActiveSprint
demoRequired
demoedDate
demoNotes
sprintIds
projectIds
blockedByIds
releaseItemIds
```

Relation IDs currently remain raw Notion page IDs:

- `sprintIds`
- `projectIds`
- `blockedByIds`
- `releaseItemIds`

When `include=relations` is supplied, JIRA endpoints also include shallow `projects`, `sprints`, and `blockedBy` arrays. Raw relation ID arrays remain unchanged. `blockedBy` JIRAs are not recursively enriched.

For `GET /api/jiras/:jiraKey?include=relations`, the detail response also includes Sprint planning history:

```json
{
  "sprintHistory": [
    {
      "sprint": {
        "id": "sprint-page-id",
        "name": "Sprint 5",
        "active": false,
        "startDate": "2026-08-01",
        "endDate": "2026-08-15"
      },
      "allocationId": "allocation-page-id",
      "plannedDays": 5,
      "allocationNotes": "Initial allocation",
      "allocationConflict": false,
      "allocationCount": 1
    }
  ],
  "spillEvents": [
    {
      "number": 1,
      "fromSprint": {
        "id": "sprint-page-id",
        "name": "Sprint 5",
        "active": false,
        "startDate": "2026-08-01",
        "endDate": "2026-08-15"
      },
      "toSprint": {
        "id": "next-sprint-page-id",
        "name": "Sprint 6",
        "active": true,
        "startDate": "2026-08-16",
        "endDate": "2026-08-31"
      },
      "reason": null
    }
  ],
  "latestSpill": null
}
```

Sprint references are sorted chronologically by Sprint Start Date, then End Date, then name and ID fallback. The API does not trust Notion relation order for Sprint history.

`sprintHistory` is built by querying Sprint Allocations once for the JIRA relation and merging matching allocations by Sprint. JIRA list endpoints do not perform this allocation query. Missing allocations are returned as `plannedDays: null`, `allocationId: null`, `allocationNotes: ""`, `allocationConflict: false`, and `allocationCount: 0`.

If more than one Sprint Allocation exists for the same JIRA and Sprint, the API does not choose one row as authoritative. The history item returns `plannedDays: null`, `allocationId: null`, `allocationNotes: ""`, `allocationConflict: true`, and the duplicate row count in `allocationCount`.

`spillEvents` are derived from chronological Sprint transitions. `latestSpill` is the event whose number matches `spilloverCount`; if that event cannot be derived, it is `null`. Because the current Notion schema stores only one top-level `spilloverReason`, the reason is attached only to the matching latest spill event when available.

## Historical JIRA Goal

Old JIRAs should remain queryable later by JIRA key. Sprint history should not be destroyed by removing historical relations just to simplify active sprint views.

## Tests

The current test suite is expected to pass with:

```bash
npm test -- --run
```

Current tests cover:

- root route response
- normal 404 behavior
- JIRA route handling
- JIRA mapping
- Notion request URL
- Notion request headers
- Notion request body
- filter payloads for each JIRA endpoint
- lookup by JIRA Key
- not-found and duplicate-key lookup behavior
- enriched JIRA detail Sprint history and spill events
- JIRA detail Sprint Allocation query pagination
- no Sprint Allocation query for JIRA list routes
- HTTP QUERY request-body filters
- unknown JIRA path fallthrough behavior

Do not hardcode current sample test records as assumptions about production data.

## Related Docs

- [Architecture](architecture.md)
- [Relation Enrichment](relation-enrichment.md)
- [Notion Integration](notion-integration.md)
- [Worker as API Proxy](../documentation/04-worker-as-api-proxy.md)
