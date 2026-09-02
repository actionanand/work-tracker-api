# Worker as API Proxy

An API proxy is a backend layer that receives client requests, calls another service on the client's behalf, and returns a response shaped for the client.

In this project, the Cloudflare Worker proxies between the Angular/Capacitor app and the Notion REST API.

## Current Request Flow

```text
Angular / Capacitor App
        |
        | GET /api/jiras/blocked
        v
Cloudflare Worker
        |
        | POST /v1/data_sources/{id}/query
        | Authorization: Bearer <NOTION_TOKEN>
        v
Notion REST API
        |
        v
Cloudflare Worker
        |
        | map/normalize response
        v
Angular App
```

## Why the App Does Not Call Notion Directly

The Angular/Capacitor app should not call Notion directly because:

- the Notion token would be bundled into JavaScript or APK files
- APK contents can be inspected
- build-time environment variables are not secret after bundling
- Notion-specific response parsing would leak into the frontend
- security policies would be harder to centralize
- changing backend implementation could require app updates

## Backend for Frontend

This Worker can reasonably be described as a lightweight Backend for Frontend, or BFF, for the Work Tracker application.

A BFF gives one client application a backend API tailored to its needs. Here, the Worker hides Notion authentication, sends Notion query filters, and returns clean JSON that is easier for the app to consume.

## Raw Notion JSON Versus Clean API JSON

Raw Notion data is nested around property types. A JIRA key is conceptually found under a shape like:

```text
properties["JIRA Key"].title[...]
```

The app receives a cleaner representation:

```json
{
  "jiraKey": "CRI-1234",
  "status": "Blocked",
  "spillover": true
}
```

## Code Responsibilities

| File | Responsibility |
| --- | --- |
| `jira.routes.ts` | HTTP endpoint selection and route-to-filter mapping. |
| `jira.service.ts` | Domain/query orchestration. |
| `notion-client.ts` | Shared Notion HTTP communication. |
| `jira.mapper.ts` | Notion response to application model. |
| `jira.filters.ts` | Notion-side query filters. |

## Notion-Side Filtering

Filtering should happen in Notion when practical instead of fetching every row and filtering in Angular.

Benefits:

- less data transferred from Notion
- less backend memory and processing per request
- consistent server-side filter semantics
- cleaner frontend code
- better future path for pagination

Current filtered endpoints:

- `/api/jiras/active`
- `/api/jiras/blocked`
- `/api/jiras/spillovers`
- `/api/jiras/appraisal`
- `/api/jiras/demo-pending`
- `/api/jiras/demoed`

The Worker currently reads data for this JIRA feature set. Future write APIs can use `POST` or `PATCH` while still keeping the Notion token on the server side.

## Related Docs

- [Architecture](../knowledge-base/architecture.md)
- [JIRA API](../knowledge-base/jira-api.md)
- [Notion Integration](../knowledge-base/notion-integration.md)
