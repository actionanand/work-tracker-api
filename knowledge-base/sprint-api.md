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

Date parameters are validated before Notion is called. Invalid dates return HTTP 400:

```json
{
  "error": "Invalid date query parameter",
  "parameter": "from",
  "expectedFormat": "YYYY-MM-DD"
}
```

Company-based Sprint history is planned and should become straightforward after Projects/Companies data sources are integrated. Company filtering is not implemented yet.

## Sprint Filters

| Endpoint | Notion Filter Semantics |
| --- | --- |
| `/api/sprints/active` | `Active = true` |
| `/api/sprints/history` | `Active = false` |

Query parameters are composed with `and` filters in the Notion data-source query body. Filtering is not performed by fetching all rows and filtering in JavaScript.

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
- unknown subpath fallthrough behavior

## Related Docs

- [Architecture](architecture.md)
- [Notion Integration](notion-integration.md)
- [Decisions](decisions.md)
