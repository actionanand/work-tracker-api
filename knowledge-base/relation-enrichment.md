# Relation Enrichment

This document describes the opt-in relation-name enrichment behavior.

## Opt-In Parameter

Selected endpoints support:

```text
include=relations
```

Without this query parameter, existing API responses remain unchanged. Raw relation ID arrays such as `companyIds`, `teamIds`, `projectIds`, `jiraIds`, and `sprintIds` remain available even when enrichment is enabled.

Unsupported include values return HTTP 400 before Notion is called:

```json
{
  "error": "Invalid query parameter",
  "parameter": "include",
  "message": "Supported value: relations"
}
```

## Resolved Objects

Resolved relation objects are shallow:

```ts
interface CompanyRef {
  id: string;
  name: string;
}

interface TeamRef {
  id: string;
  name: string;
}

interface ProjectRef {
  id: string;
  name: string;
}

interface SprintRef {
  id: string;
  name: string;
}

interface JiraRef {
  id: string;
  key: string;
  summary: string;
}
```

No recursive expansion is performed. For example, a JIRA can include `projects`, `sprints`, and `blockedBy`, but `blockedBy` JIRAs are not recursively enriched.

## N+1 Avoidance

Enrichment does not resolve one Notion page per relation ID. The Worker:

1. maps the primary response as usual
2. collects unique relation IDs needed by that response
3. loads only the required catalogs for that endpoint
4. follows Notion pagination for catalog reads
5. resolves relation IDs from in-memory maps

Per-request in-memory maps are used. There is no Cloudflare KV, D1, or persistent cache in this implementation.

If a related ID cannot be resolved from the loaded catalog, it is omitted from the resolved array. The original raw ID remains in the existing `*Ids` field, and the endpoint does not fail.

## Supported Endpoints

`include=relations` is supported by:

```text
GET /api/projects
GET /api/projects/active
GET /api/sprints
GET /api/sprints/active
GET /api/sprints/history
GET /api/jiras
GET /api/jiras/active
GET /api/jiras/blocked
GET /api/jiras/spillovers
GET /api/jiras/appraisal
GET /api/jiras/demo-pending
GET /api/jiras/demoed
GET /api/jiras/:jiraKey
GET /api/work-logs
GET /api/work-logs/appraisal
GET /api/releases
GET /api/releases/pending
GET /api/releases/confirmed
GET /api/releases/not-announced
GET /api/feedback
GET /api/feedback/appraisal
GET /api/feedback/improvement-follow-up
GET /api/feedback/negative
GET /api/work-links
GET /api/work-links/active
```

## Related Docs

- [Architecture](architecture.md)
- [JIRA API](jira-api.md)
- [Sprint API](sprint-api.md)
- [Company, Team, and Project API](company-team-project-api.md)
- [Work Log API](work-log-api.md)
- [Release API](release-api.md)
- [Feedback API](feedback-api.md)
- [Work Links API](work-links-api.md)
