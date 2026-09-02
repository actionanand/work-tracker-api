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
    └── sprint-allocations/
        ├── sprint-allocation.mapper.ts
        ├── sprint-allocation.filters.ts
        ├── sprint-allocation.service.ts
        └── sprint-allocation.routes.ts
```

Layer responsibilities:

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Cloudflare Worker entry point, root health response, route delegation, fallback 404. |
| `src/shared/env.ts` | Cloudflare binding interface for `NOTION_TOKEN` and `JIRAS_DATA_SOURCE_ID`. |
| `src/shared/notion/notion-client.ts` | Shared Notion data-source query client, Notion API version, common error handling. |
| `src/features/jiras/jira.routes.ts` | JIRA HTTP route selection and route-to-filter mapping. |
| `src/features/jiras/jira.service.ts` | JIRA query orchestration through the shared Notion client and mapper. |
| `src/features/jiras/jira.filters.ts` | Reusable Notion-side JIRA filter definitions. |
| `src/features/jiras/jira.mapper.ts` | Raw Notion page to clean JIRA API model mapping. |
| `src/features/sprints/*` | Sprint routes, filters, service orchestration, and mapping. |
| `src/features/sprint-allocations/*` | Sprint Allocation routes, filters, service orchestration, and mapping. |

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
  "SPRINT_ALLOCATIONS_DATA_SOURCE_ID": "your-sprint-allocations-data-source-id"
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
- [Notion Integration](knowledge-base/notion-integration.md)
- [Decisions](knowledge-base/decisions.md)
