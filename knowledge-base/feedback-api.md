# Feedback API

This document describes the currently implemented Feedback read API.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/feedback` | Query all Feedback from the configured Notion Feedback data source. |
| `GET` | `/api/feedback/appraisal` | Query appraisal-related Feedback. |
| `GET` | `/api/feedback/improvement-follow-up` | Query Feedback that suggests improvement or follow-up. |
| `GET` | `/api/feedback/negative` | Query negative Feedback. |

Unknown paths such as `/api/feedback/random` or `/api/feedback/foo/bar` are not handled by `handleFeedbackRoutes()` and fall through to the main Worker 404.

## State Definitions

| View | Notion Filter Semantics |
| --- | --- |
| Appraisal | `Context = Appraisal` or `Context = Half-Yearly Appraisal`. |
| Improvement / Follow-up | `Feedback Type = Improvement` or `Feedback Type = Suggestion`. |
| Negative | `Feedback Type = Negative`. |

## Query Parameters

Feedback endpoints support:

| Query Parameter | Notion Filter Semantics |
| --- | --- |
| `companyId=<company-page-id>` | `Company` relation contains the supplied Company page ID. |
| `projectId=<project-page-id>` | `Project` relation contains the supplied Project page ID. |
| `teamId=<team-page-id>` | `Team` relation contains the supplied Team page ID. |
| `personType=<select-value>` | `Person Type` select equals the supplied value. |
| `context=<select-value>` | `Context` select equals the supplied value. |
| `feedbackType=<select-value>` | `Feedback Type` select equals the supplied value. |
| `from=YYYY-MM-DD` | `Date` is on or after the supplied date. |
| `to=YYYY-MM-DD` | `Date` is on or before the supplied date. |

Multiple supported filters are composed with Notion `and`. Filtering is performed by Notion, not by fetching all Feedback rows and filtering in JavaScript.

`companyId`, `projectId`, and `teamId` must be valid Notion page IDs. Invalid IDs return HTTP 400 before Notion is called. Date parameters must use `YYYY-MM-DD`.

Feedback responses are sorted by `Date` descending using the Notion query API.

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

## Mapped Feedback Fields

Each mapped Feedback item can include:

```text
id
createdTime
lastEditedTime
feedback
date
feedbackFrom
personType
context
feedbackType
details
actionFollowUp
companyIds
projectIds
teamIds
```

Title, rich text, and select values are trimmed. Missing text defaults to an empty string. Missing select/date values default to `null`. Missing relations default to empty arrays.

Feedback may originate from managers, leads, colleagues, clients, or others and may be linked to Company, Project, and Team records.

When `include=relations` is supplied, Feedback endpoints also include shallow `companies`, `projects`, and `teams` arrays. Raw relation ID arrays remain unchanged.

## Not Implemented

The following are not implemented in this feature:

- Feedback create/update/delete APIs
- `/api/feedback/:id`
- Dashboard API
- caching
- Android authentication
- Notion write APIs

## Related Docs

- [Architecture](architecture.md)
- [Company, Team, and Project API](company-team-project-api.md)
- [JIRA API](jira-api.md)
- [Release API](release-api.md)
- [Relation Enrichment](relation-enrichment.md)
- [Notion Integration](notion-integration.md)
