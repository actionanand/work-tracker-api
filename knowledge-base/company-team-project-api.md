# Company, Team, and Project API

This document describes the currently implemented Companies, Teams, and Projects APIs.

## Relationship Model

```text
Company
  ├── Team
  └── Project
        └── Sprint
```

Projects belong to Company and Team independently through Notion relations. API responses currently expose relation IDs only; nested relation-name resolution is not implemented.

## Companies

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/companies` | Query all Companies. |
| `GET` | `/api/companies/active` | Query Companies where `Active = true`. |
| `GET` | `/api/companies?category=...` | Query Companies where `Category` select equals the supplied value. |

`/api/companies/active?category=...` is also supported and combines filters with Notion `and`.

Relation-ID query parameters must be valid Notion page IDs. Invalid IDs return HTTP 400 before the Worker calls Notion.

Mapped Company fields:

```text
id
company
category
division
product
active
projectIds
teamIds
```

Missing `category` maps to `null`. Missing text maps to an empty string. Missing relations map to empty arrays.

## Teams

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/teams` | Query all Teams. |
| `GET` | `/api/teams/active` | Query Teams where `Active = true`. |
| `GET` | `/api/teams?companyId=...` | Query Teams where `Company` relation contains the supplied Company page ID. |
| `GET` | `/api/teams/active?companyId=...` | Query active Teams for a Company. |

`companyId` must be a valid Notion page ID. Hyphenated UUID-shaped IDs and compact 32-character hexadecimal IDs are accepted.

Mapped Team fields:

```text
id
team
active
companyIds
projectIds
```

## Projects

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/projects` | Query all Projects. |
| `GET` | `/api/projects/active` | Query Projects where `Active = true`. |
| `GET` | `/api/projects?companyId=...` | Query Projects where `Company` relation contains the supplied Company page ID. |
| `GET` | `/api/projects?teamId=...` | Query Projects where `Team` relation contains the supplied Team page ID. |
| `GET` | `/api/projects?companyId=...&teamId=...` | Query Projects matching both Company and Team. |

`/api/projects/active` supports the same `companyId` and `teamId` filters.

`companyId` and `teamId` must be valid Notion page IDs. Invalid IDs return:

```json
{
  "error": "Invalid query parameter",
  "parameter": "companyId",
  "message": "Expected a valid Notion page ID"
}
```

Mapped Project fields:

```text
id
project
active
companyIds
teamIds
```

## Sprint History by Company

Sprint history supports:

```text
GET /api/sprints/history?companyId=<company-page-id>
GET /api/sprints/history?companyId=<company-page-id>&from=2026-01-01&to=2026-12-31
```

The Sprints data source does not have a direct Company relation. The Worker implements Company filtering by:

1. Querying the Projects data source where `Company` contains the supplied Company page ID.
2. Following Notion pagination until all matching Project pages are found.
3. Building a Sprint `Project` relation filter from those Project page IDs.
4. Combining that filter with `Active = false` and optional `from`/`to` overlap filters.
5. Querying the Sprints data source with the composed Notion filter.

When more than one Project belongs to the Company, the Sprint Project filter uses Notion `or`.

If no Projects match the Company, the Worker returns a successful empty collection and does not query Sprints.

`companyId` must be a valid Notion page ID and is validated before querying Projects.

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

## Not Implemented

The following are not implemented in this feature set:

- nested relation-name resolution
- create/update/delete APIs
- Company lookup by name
- Project lookup by name
- JIRA filtering by Company
- JIRA filtering by Project name

## Related Docs

- [Architecture](architecture.md)
- [Sprint API](sprint-api.md)
- [Notion Integration](notion-integration.md)
