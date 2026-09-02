# Work Log API

This document describes the currently implemented Work Logs read API.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/work-logs` | Query Work Logs from the configured Notion Work Logs data source. |
| `GET` | `/api/work-logs/appraisal` | Query Work Logs where `Appraisal = true`. |

Unknown paths such as `/api/work-logs/random` are not handled by `handleWorkLogRoutes()` and fall through to the main Worker 404.

## Query Parameters

`GET /api/work-logs` supports:

| Query Parameter | Notion Filter Semantics |
| --- | --- |
| `from=YYYY-MM-DD` | `Date` is on or after the supplied date. |
| `to=YYYY-MM-DD` | `Date` is on or before the supplied date. |
| `projectId=<project-page-id>` | `Project` relation contains the supplied Project page ID. |
| `jiraId=<jira-page-id>` | `JIRAs` relation contains the supplied JIRA page ID. |
| `category=<select-value>` | `Category` select equals the supplied value. |
| `type=<select-value>` | `Type` select equals the supplied value. |
| `workMode=<select-value>` | `Work Mode` select equals the supplied value. |

Multiple supported filters are composed with Notion `and`. Filtering is performed by Notion, not by fetching all Work Logs and filtering in JavaScript.

`projectId` and `jiraId` must be valid Notion page IDs. Invalid IDs return HTTP 400 before Notion is called. Date parameters must use `YYYY-MM-DD`.

Work Logs are sorted by `Date` descending.

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

## Mapped Work Log Fields

Each mapped Work Log can include:

```text
id
createdTime
lastEditedTime
update
date
category
type
workMode
comment
wentWrong
appraisal
projectIds
jiraIds
companyIds
teamIds
jiraStatuses
sprintIds
spilloverCount
```

Title, rich text, and select values are trimmed. Missing text defaults to an empty string. Missing select/date values default to `null`. Missing relation and rollup collections default to empty arrays. Missing rollup numbers default to `0`.

## Work Log History

A Work Log may exist without a JIRA. One JIRA may have multiple Work Logs across different dates.

Work Logs are historical daily records and should not be deleted when a Sprint ends. They preserve what happened on a specific date even if Sprint membership or JIRA state changes later.

## Not Implemented

The following are not implemented in this feature:

- Work Log create/update/delete APIs
- `/api/work-logs/:id`
- nested Project/Company/Team resolution
- caching
- Android authentication

## Related Docs

- [Architecture](architecture.md)
- [JIRA API](jira-api.md)
- [Sprint API](sprint-api.md)
- [Notion Integration](notion-integration.md)
