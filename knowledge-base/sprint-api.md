# Sprint API

This document describes the Sprints and Sprint Allocations APIs currently implemented in the Work Tracker API.

## Sprint Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/sprints` | Query all sprints from the configured Notion Sprints data source. |
| `GET` | `/api/sprints/active` | Query active sprints. |
| `GET` | `/api/sprints/history` | Query inactive sprints, sorted by newest Start Date first. |

Unknown paths such as `/api/sprints/random` are not handled by `handleSprintRoutes()` and fall through to the main Worker 404.

## Sprint Query Parameters

The following optional query parameters are implemented for `/api/sprints` and `/api/sprints/history`:

| Query Parameter | Notion Filter Semantics |
| --- | --- |
| `projectId=<notion-project-page-id>` | `Project` relation contains the supplied page ID. |
| `from=YYYY-MM-DD` | `End Date` is on or after the supplied date. |
| `to=YYYY-MM-DD` | `Start Date` is on or before the supplied date. |

`/api/sprints/history` also supports:

| Query Parameter | Behavior |
| --- | --- |
| `companyId=<company-page-id>` | Resolve matching Projects for the Company, then query historical Sprints whose `Project` relation contains one of those Project IDs. |

Date parameters are validated before Notion is called. Invalid dates return HTTP 400:

```json
{
  "error": "Invalid date query parameter",
  "parameter": "from",
  "expectedFormat": "YYYY-MM-DD"
}
```

Relation-ID query parameters such as `projectId` and `companyId` must be valid Notion page IDs. Hyphenated UUID-shaped IDs and compact 32-character hexadecimal IDs are accepted. Invalid IDs return HTTP 400 before Notion is called:

```json
{
  "error": "Invalid query parameter",
  "parameter": "projectId",
  "message": "Expected a valid Notion page ID"
}
```

Company-based Sprint history is implemented through the Projects data source. If a Company has no matching Projects, the Worker returns an empty collection without querying Sprints.

Sprint collection endpoints support shared server-side pagination with `pageSize` and `cursor`. `pageSize` defaults to `25` and maxes at `100`; `count` is the current page size, not a total. Cursors are opaque and should be discarded when filters or views change. Company-to-Project resolution for Sprint history continues to fetch all matching Projects internally before applying the public Sprint page.

## Sprint Filters

| Endpoint | Notion Filter Semantics |
| --- | --- |
| `/api/sprints/active` | `Active = true` |
| `/api/sprints/history` | `Active = false` |

Query parameters are composed with `and` filters in the Notion data-source query body. Filtering is not performed by fetching all rows and filtering in JavaScript.

When a Company resolves to multiple Projects, the Project relation portion of the Sprint filter is composed with Notion `or`.

## Mapped Sprint Fields

Each mapped Sprint can include:

```text
id
sprint
active
startDate
endDate
weekOff1
weekOff2
plannedLeaveDays
holidayDays
capacityDays
availableDays
allocatedDays
remainingDays
projectIds
allocationIds
```

Formula and rollup numbers default to `0` when Notion values are missing or null. Date/select values default to `null`. Relation values are returned as raw Notion page IDs.

When `include=relations` is supplied, Sprint endpoints also include shallow `projects` arrays. Raw `projectIds` remain unchanged.

## Sprint Allocation Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/sprint-allocations` | Query all sprint allocations from the configured Notion Sprint Allocations data source. |
| `GET` | `/api/sprint-allocations/current` | Query allocations whose related Sprint is active. |

Unknown paths such as `/api/sprint-allocations/random` are not handled by `handleSprintAllocationRoutes()` and fall through to the main Worker 404.

## Sprint Allocation Query Parameters

The following optional query parameters are implemented for `/api/sprint-allocations`:

| Query Parameter | Notion Filter Semantics |
| --- | --- |
| `sprintId=<sprint-page-id>` | `Sprint` relation contains the supplied page ID. |
| `jiraId=<jira-page-id>` | `JIRA` relation contains the supplied page ID. |

If both are provided, they are composed with a Notion `and` filter.

`sprintId` and `jiraId` must be valid Notion page IDs.

Sprint Allocation collection endpoints support the same shared `pageSize` and `cursor` pagination contract.

## Sprint Allocation Filters

`/api/sprint-allocations/current` sends a Notion rollup `any` filter for:

```text
Sprint Active = true
```

`Sprint Active` is a Notion rollup of `Sprint.Active`. The mapper is defensive and treats empty or null rollups as `false`. It supports array rollup items containing checkbox values and direct checkbox rollup values.

Live inspection of the actual project data was attempted, but the local token available to this environment was not valid for the Notion API. The implemented filter follows the Notion rollup `any` checkbox representation requested for this data source.

## Mapped Sprint Allocation Fields

Each mapped Sprint Allocation can include:

```text
id
allocation
plannedDays
notes
sprintIds
jiraIds
sprintActive
```

Relation values are returned as raw Notion page IDs. Relation-name resolution is intentionally not implemented yet.

## Response Shape

All Sprint and Sprint Allocation collection endpoints return:

```json
{
  "data": [],
  "count": 0,
  "hasMore": false,
  "nextCursor": null
}
```

## Tests

Current tests cover:

- Sprint route request bodies and data source IDs
- Sprint filters for active/history/project/date overlap queries
- history sorting by Start Date descending
- invalid date handling before Notion calls
- Sprint title/date/select/number/formula/relation/rollup mapping
- Sprint Allocation route request bodies and data source IDs
- Sprint Allocation current/sprint/JIRA filters
- combined Sprint Allocation relation filters
- Sprint Active rollup mapping fallbacks
- Sprint history filtering by Company through Projects
- Company-to-Projects pagination during Sprint history resolution
- unknown subpath fallthrough behavior

## Related Docs

- [Architecture](architecture.md)
- [Relation Enrichment](relation-enrichment.md)
- [Notion Integration](notion-integration.md)
- [Decisions](decisions.md)
- [Company, Team, and Project API](company-team-project-api.md)
