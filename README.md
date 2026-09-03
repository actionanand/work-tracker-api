# Work Tracker API

Work Tracker API is a personal backend/API for a Work Tracker application. It is implemented as a Cloudflare Worker using TypeScript.

The current client architecture is:

```text
Angular / Capacitor Android app
        |
        | HTTPS REST
        v
Cloudflare Worker
        |
        | Notion API Bearer token stored only as Worker secret
        v
Notion REST API
```

The Android/Angular app must never contain the Notion Personal Access Token. Build-time client variables are bundled into JavaScript and APK assets, so they are not secret. The Worker is the security boundary between the app and Notion.

## Current Role

The Worker currently acts as:

- API backend for the app
- security boundary for the Notion token
- proxy between the client and Notion
- response transformation layer from raw Notion JSON to app-friendly JSON
- future location for filtering, validation, authentication, caching, aggregation, and write operations

## Source Structure

```text
src/
├── index.ts
├── shared/
│   ├── env.ts
│   └── notion/
│       └── notion-client.ts
└── features/
    ├── jiras/
    │   ├── jira.mapper.ts
    │   ├── jira.filters.ts
    │   ├── jira.service.ts
    │   └── jira.routes.ts
    ├── sprints/
    │   ├── sprint.mapper.ts
    │   ├── sprint.filters.ts
    │   ├── sprint.service.ts
    │   └── sprint.routes.ts
    ├── sprint-allocations/
    │   ├── sprint-allocation.mapper.ts
    │   ├── sprint-allocation.filters.ts
    │   ├── sprint-allocation.service.ts
    │   └── sprint-allocation.routes.ts
    ├── companies/
    │   ├── company.mapper.ts
    │   ├── company.filters.ts
    │   ├── company.service.ts
    │   └── company.routes.ts
    ├── teams/
    │   ├── team.mapper.ts
    │   ├── team.filters.ts
    │   ├── team.service.ts
    │   └── team.routes.ts
    ├── projects/
    │   ├── project.mapper.ts
    │   ├── project.filters.ts
    │   ├── project.service.ts
    │   └── project.routes.ts
    ├── work-logs/
    │   ├── work-log.mapper.ts
    │   ├── work-log.filters.ts
    │   ├── work-log.service.ts
    │   └── work-log.routes.ts
    ├── releases/
    │   ├── release.mapper.ts
    │   ├── release.filters.ts
    │   ├── release.service.ts
    │   └── release.routes.ts
    ├── feedback/
    │   ├── feedback.mapper.ts
    │   ├── feedback.filters.ts
    │   ├── feedback.service.ts
    │   └── feedback.routes.ts
    └── work-links/
        ├── work-link.mapper.ts
        ├── work-link.filters.ts
        ├── work-link.service.ts
        └── work-link.routes.ts
```

Layer responsibilities:

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Cloudflare Worker entry point, root health response, route delegation, fallback 404. |
| `src/shared/env.ts` | Cloudflare binding interface for secrets and data source IDs. |
| `src/shared/notion/notion-client.ts` | Shared Notion data-source query client, Notion API version, common error handling. |
| `src/features/jiras/jira.routes.ts` | JIRA HTTP route selection and route-to-filter mapping. |
| `src/features/jiras/jira.service.ts` | JIRA query orchestration through the shared Notion client and mapper. |
| `src/features/jiras/jira.filters.ts` | Reusable Notion-side JIRA filter definitions. |
| `src/features/jiras/jira.mapper.ts` | Raw Notion page to clean JIRA API model mapping. |
| `src/features/sprints/*` | Sprint routes, filters, service orchestration, and mapping. |
| `src/features/sprint-allocations/*` | Sprint Allocation routes, filters, service orchestration, and mapping. |
| `src/features/companies/*` | Company routes, filters, service orchestration, and mapping. |
| `src/features/teams/*` | Team routes, filters, service orchestration, and mapping. |
| `src/features/projects/*` | Project routes, filters, service orchestration, mapping, and internal Company-to-Project resolution. |
| `src/features/work-logs/*` | Work Log routes, filters, service orchestration, and mapping. |
| `src/features/releases/*` | Release Item routes, filters, service orchestration, and mapping. |
| `src/features/feedback/*` | Feedback routes, filters, service orchestration, and mapping. |
| `src/features/work-links/*` | Work Link routes, filters, service orchestration, and mapping. |

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Health/root response. |
| `GET` | `/api/jiras` | All JIRAs from the configured Notion data source. |
| `GET` | `/api/jiras/active` | JIRAs in the active sprint. |
| `GET` | `/api/jiras/blocked` | Active sprint JIRAs with `Status = Blocked`. |
| `GET` | `/api/jiras/spillovers` | Active sprint JIRAs marked as spillovers. |
| `GET` | `/api/jiras/appraisal` | JIRAs marked for appraisal. |
| `GET` | `/api/jiras/demo-pending` | JIRAs requiring a demo with no demo date. |
| `GET` | `/api/jiras/demoed` | JIRAs with a demo date. |
| `GET` | `/api/jiras/:jiraKey` | Single JIRA lookup by JIRA Key, such as `/api/jiras/CRI-1234`. |
| `GET` | `/api/sprints` | All Sprints from the configured Notion data source. |
| `GET` | `/api/sprints/active` | Active Sprints. |
| `GET` | `/api/sprints/history` | Inactive Sprints, newest Start Date first. |
| `GET` | `/api/sprint-allocations` | All Sprint Allocations from the configured Notion data source. |
| `GET` | `/api/sprint-allocations/current` | Sprint Allocations whose related Sprint is active. |
| `GET` | `/api/companies` | All Companies from the configured Notion data source. |
| `GET` | `/api/companies/active` | Active Companies. |
| `GET` | `/api/teams` | All Teams from the configured Notion data source. |
| `GET` | `/api/teams/active` | Active Teams. |
| `GET` | `/api/projects` | All Projects from the configured Notion data source. |
| `GET` | `/api/projects/active` | Active Projects. |
| `GET` | `/api/work-logs` | All Work Logs from the configured Notion data source, sorted by Date descending. |
| `GET` | `/api/work-logs/appraisal` | Work Logs marked for appraisal. |
| `GET` | `/api/releases` | All Release Items from the configured Notion data source, sorted by Formal Announced Date descending. |
| `GET` | `/api/releases/pending` | Release Items formally announced but not yet confirmed. |
| `GET` | `/api/releases/confirmed` | Release Items with a confirmed release date. |
| `GET` | `/api/releases/not-announced` | Release Items without a formal announced date. |
| `GET` | `/api/feedback` | All Feedback from the configured Notion data source, sorted by Date descending. |
| `GET` | `/api/feedback/appraisal` | Feedback with appraisal contexts. |
| `GET` | `/api/feedback/improvement-follow-up` | Feedback marked as improvement or suggestion. |
| `GET` | `/api/feedback/negative` | Negative Feedback. |
| `GET` | `/api/work-links` | All Work Links from the configured Notion data source, sorted by Link ascending. |
| `GET` | `/api/work-links/active` | Active Work Links. |

Relation-ID query parameters such as `companyId`, `teamId`, `projectId`, `sprintId`, and `jiraId` must be valid Notion page IDs. Invalid IDs return HTTP 400 before Notion is called.

Root response:

```json
{
  "name": "Work Tracker API",
  "status": "ok"
}
```

JIRA list responses use this structure:

```json
{
  "data": [],
  "count": 0,
  "hasMore": false,
  "nextCursor": null
}
```

## Prerequisites

- Node.js 24
- npm
- Cloudflare account for production deployment
- Notion Personal Access Token
- Notion JIRAs Data Source ID
- Notion Sprints Data Source ID
- Notion Sprint Allocations Data Source ID
- Notion Companies Data Source ID
- Notion Teams Data Source ID
- Notion Projects Data Source ID
- Notion Work Logs Data Source ID
- Notion Release Items Data Source ID
- Notion Feedback Data Source ID
- Notion Work Links Data Source ID

## Setup

Install dependencies:

```bash
npm install
```

Create `.dev.vars` locally at the repository root. This file is intentionally gitignored.

```ini
NOTION_TOKEN=your_notion_token_here
```

Do not commit `.dev.vars`.

Configure non-secret IDs in `wrangler.jsonc`:

```jsonc
"vars": {
  "JIRAS_DATA_SOURCE_ID": "your-jiras-data-source-id",
  "SPRINTS_DATA_SOURCE_ID": "your-sprints-data-source-id",
  "SPRINT_ALLOCATIONS_DATA_SOURCE_ID": "your-sprint-allocations-data-source-id",
  "PROJECTS_DATA_SOURCE_ID": "your-projects-data-source-id",
  "COMPANIES_DATA_SOURCE_ID": "your-companies-data-source-id",
  "TEAMS_DATA_SOURCE_ID": "your-teams-data-source-id",
  "WORK_LOGS_DATA_SOURCE_ID": "your-work-logs-data-source-id",
  "RELEASE_ITEMS_DATA_SOURCE_ID": "your-release-items-data-source-id",
  "FEEDBACK_DATA_SOURCE_ID": "your-feedback-data-source-id",
  "WORK_LINKS_DATA_SOURCE_ID": "your-work-links-data-source-id"
}
```

## Local Development

Start the Worker locally:

```bash
npm run dev
```

Wrangler normally serves the Worker at:

```text
http://localhost:8787
```

Example checks:

```bash
curl -s http://localhost:8787/ | jq
curl -s http://localhost:8787/api/jiras | jq
curl -s http://localhost:8787/api/jiras/blocked | jq
curl -s http://localhost:8787/api/jiras/CRI-1234 | jq
curl -s http://localhost:8787/api/sprints/active | jq
curl -s http://localhost:8787/api/sprint-allocations/current | jq
curl -s http://localhost:8787/api/companies/active | jq
curl -s http://localhost:8787/api/teams?companyId=company-page-id | jq
curl -s http://localhost:8787/api/projects?companyId=company-page-id | jq
curl -s http://localhost:8787/api/work-logs?from=2026-09-01\&to=2026-09-30 | jq
curl -s http://localhost:8787/api/releases/pending?deploymentType=Backstage | jq
curl -s http://localhost:8787/api/feedback/negative?from=2026-01-01\&to=2026-12-31 | jq
curl -s http://localhost:8787/api/work-links/active?type=Documentation | jq
```

`jq` is only used to pretty-print JSON in the terminal. It is not a Worker dependency.

## Tests

Run tests once and exit:

```bash
npm test -- --run
```

Plain `npm test` starts Vitest watch mode. The `--run` flag is useful for a single verification pass because it runs the suite once and exits.

## Documentation

Project guides:

- [What is a Cloudflare Worker?](documentation/01-cloudflare-workers.md)
- [Project Creation](documentation/02-project-creation.md)
- [Environment Variables and Secrets](documentation/03-environment-variables-and-secrets.md)
- [Worker as API Proxy](documentation/04-worker-as-api-proxy.md)
- [Local Development](documentation/05-local-development.md)
- [Deployment](documentation/06-deployment.md)
- [Security](documentation/07-security.md)

Living technical references:

- [Architecture](knowledge-base/architecture.md)
- [JIRA API](knowledge-base/jira-api.md)
- [Sprint API](knowledge-base/sprint-api.md)
- [Company, Team, and Project API](knowledge-base/company-team-project-api.md)
- [Work Log API](knowledge-base/work-log-api.md)
- [Release API](knowledge-base/release-api.md)
- [Feedback API](knowledge-base/feedback-api.md)
- [Work Links API](knowledge-base/work-links-api.md)
- [Notion Integration](knowledge-base/notion-integration.md)
- [Decisions](knowledge-base/decisions.md)
