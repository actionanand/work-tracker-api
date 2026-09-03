# Dashboard API

The Dashboard API provides the first aggregate read model for the Work Tracker app.

Dashboard routes require `Authorization: Bearer <accessToken>`, like other protected `/api/*` routes.

## Endpoint

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Aggregate dashboard summary and key lists. |

Optional query parameters:

| Parameter | Description |
| --- | --- |
| `companyId` | Scope supported dashboard sections to a Company Notion page ID. |
| `projectId` | Scope supported dashboard sections to a Project Notion page ID. |

`companyId` and `projectId` must be valid Notion page IDs. Invalid IDs return HTTP 400 before Notion is called.

## Response Shape

```json
{
  "generatedAt": "2026-09-03T00:00:00.000Z",
  "company": null,
  "project": null,
  "currentSprint": null,
  "jiraSummary": {
    "active": 0,
    "blocked": 0,
    "spillovers": 0,
    "demoPending": 0
  },
  "activeJiras": [],
  "blockedJiras": [],
  "spilloverJiras": [],
  "demoPendingJiras": [],
  "recentWorkLogs": [],
  "releaseSummary": {
    "pending": 0,
    "confirmed": 0,
    "notAnnounced": 0
  },
  "pendingReleases": [],
  "feedbackSummary": {
    "appraisal": 0,
    "improvementFollowUp": 0,
    "negative": 0
  },
  "activeWorkLinks": []
}
```

Dashboard list sections use relation-enriched records by default. Existing standalone API endpoints remain unchanged and still require `include=relations` for optional relation-name enrichment.

## Scoping

No query parameters returns all applicable dashboard data.

With `projectId`, project-related sections are filtered through the Project relation where supported. Work Links use their direct Project relation filter. Feedback is scoped through the Project's related Company because the live Feedback `Project` property is a rollup. Release Items are scoped by first resolving JIRAs whose Project relation contains the Project ID, then filtering Release Items by their `JIRAs` relation.

With `companyId`, the dashboard validates the Company, resolves matching Projects through the Projects data source, and uses those Project IDs for JIRAs, Sprints, Work Logs, and Release Items. Feedback and Work Links use their direct Company relation filters. A valid Company with no matching Projects returns empty project-related sections.

With both `companyId` and `projectId`, both IDs are validated. Directly scoped sections such as Feedback and Work Links use both filters. The dashboard does not currently assert that the Project belongs to the Company.

Release Items do not have a direct Project relation. The dashboard never applies Project IDs to Release Item rollups such as `Sprints`; it filters Release Items only through the direct `JIRAs` relation.

Feedback does not have a direct Project relation in the live schema. The `Project` property is a rollup, so project-scoped Dashboard feedback counts use the Project's related Company IDs and filter Feedback through the direct `Company` relation.

## Current Sprint

`currentSprint` uses the active Sprint filter and the requested Project scope when present. If multiple active Sprints match, the API requests Sprints sorted by Start Date descending and returns the first result from Notion. If no active Sprint matches, `currentSprint` is `null`.

## Recent Work Logs

`recentWorkLogs` requests the latest 10 Work Logs from Notion using:

- `Date` descending sort
- `Date is not empty` filter
- Project relation scope when applicable

Null-date Work Logs are excluded by Notion filtering, not by JavaScript post-processing.

## Errors

Invalid relation IDs:

```json
{
  "error": "Invalid query parameter",
  "parameter": "companyId",
  "message": "Expected a valid Notion page ID"
}
```

Missing scoped entities:

```json
{
  "error": "Company not found"
}
```

```json
{
  "error": "Project not found"
}
```
