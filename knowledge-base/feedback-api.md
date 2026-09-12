# Feedback API

This document describes the currently implemented Feedback API.

## Endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/feedback` | Query all Feedback from the configured Notion Feedback data source. |
| `GET` | `/api/feedback/appraisal` | Query appraisal-related Feedback. |
| `GET` | `/api/feedback/improvement-follow-up` | Query Feedback that suggests improvement or follow-up. |
| `GET` | `/api/feedback/negative` | Query negative Feedback. |
| `GET` | `/api/feedback/meta` | Return normalized field metadata from the Notion data-source schema. |
| `QUERY` | `/api/feedback` | Query Feedback with a JSON request body and Notion-side filters. |
| `POST` | `/api/feedback` | Create Feedback through allow-listed mapped fields. |
| `PATCH` | `/api/feedback/:pageId` | Update Feedback after validating the target page belongs to the Feedback data source. |

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
| `teamId=<team-page-id>` | `Team` relation contains the supplied Team page ID. |
| `personType=<select-value>` | `Person Type` select equals the supplied value. |
| `context=<select-value>` | `Context` select equals the supplied value. |
| `feedbackType=<select-value>` | `Feedback Type` select equals the supplied value. |
| `from=YYYY-MM-DD` | `Date` is on or after the supplied date. |
| `to=YYYY-MM-DD` | `Date` is on or before the supplied date. |

Multiple supported filters are composed with Notion `and`. Filtering is performed by Notion, not by fetching all Feedback rows and filtering in JavaScript.

`companyId` and `teamId` must be valid Notion page IDs. Invalid IDs return HTTP 400 before Notion is called. Date parameters must use `YYYY-MM-DD`.

Feedback no longer supports canonical `projectId` filtering because the live Feedback schema does not have a direct writable Project relation. `Work Type` is read from a Notion rollup and is read-only.

Feedback collection endpoints support shared server-side pagination with `pageSize` and `cursor`. `pageSize` defaults to `25` and maxes at `100`; `count` is the current page size, not a total. Cursors are opaque and should be discarded when filters or views change.

Feedback responses are sorted by `Date` descending using the Notion query API.

## HTTP QUERY

`QUERY /api/feedback` accepts `Content-Type: application/json` and supports:

```json
{
  "filters": {
    "from": "2026-01-01",
    "to": "2026-12-31",
    "companyIds": ["company-page-id"],
    "teamIds": ["team-page-id"],
    "personTypes": ["Manager"],
    "contexts": ["Weekly Update"],
    "feedbackTypes": ["Positive"]
  },
  "pageSize": 25,
  "cursor": "opaque-cursor",
  "includeRelations": false
}
```

Multiple values for one field are composed with Notion `or`. Different fields are composed with Notion `and`. Unknown top-level fields or filter names return HTTP 400 before Notion is called.

## Metadata

`GET /api/feedback/meta` reads the current Notion data-source schema and returns normalized field metadata, including select option IDs for writable select properties and options endpoint hints for Company and Team relations. `workType` is exposed as read-only metadata.

## Writes

`POST /api/feedback` returns HTTP 201 with `{ "data": <mapped-feedback> }`. `PATCH /api/feedback/:pageId` returns HTTP 200 with the same shape.

Writable fields:

```text
feedback
date
feedbackFrom
personTypeOptionId
contextOptionId
feedbackTypeOptionId
companyId
teamId
details
actionFollowUp
```

Select fields require Notion option IDs from `/api/feedback/meta`; display names are not accepted for writes. `projectId`, `projectIds`, `workType`, unknown fields, and other read-only fields return HTTP 400. `PATCH` validates `pageId` as a Notion page ID and checks page ownership before updating.

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
teamIds
workType
```

Title, rich text, and select values are trimmed. Missing text defaults to an empty string. Missing select/date values default to `null`. Missing relations default to empty arrays.

Feedback may originate from managers, leads, colleagues, clients, or others and may be linked to Company and Team records. `workType` is derived from the related Company's Notion rollup when present.

When `include=relations` is supplied, Feedback endpoints also include shallow `companies` and `teams` arrays. Raw relation ID arrays remain unchanged.

## Not Implemented

The following are not implemented in this feature:

- Feedback delete APIs
- `GET /api/feedback/:id`
- caching

## Related Docs

- [Architecture](architecture.md)
- [Company, Team, and Project API](company-team-project-api.md)
- [JIRA API](jira-api.md)
- [Release API](release-api.md)
- [Relation Enrichment](relation-enrichment.md)
- [Notion Integration](notion-integration.md)
