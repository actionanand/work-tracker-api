# Decisions

This document records project decisions and distinguishes implemented choices from future plans.

## 1. Use Cloudflare Workers as the Backend/API Proxy

**Decision**

Use Cloudflare Workers as the backend/API proxy for the Work Tracker app.

**Reason**

This avoids exposing the Notion token in the Angular/Capacitor app and provides a central API layer for filtering, transformation, validation, authentication, caching, aggregation, and future write operations.

**Status**

Accepted.

## 2. Use Official Notion REST API

**Decision**

Use the official Notion REST API for Notion data access.

**Reason**

The Notion REST API is the supported integration surface and works from Cloudflare Workers through native `fetch`.

**Status**

Accepted.

## 3. Use `.dev.vars` for Local `NOTION_TOKEN`

**Decision**

Use `.dev.vars` to provide `NOTION_TOKEN` during local development.

**Reason**

Wrangler loads `.dev.vars` locally and injects values into `env`, keeping secrets out of source code and committed config.

**Status**

Accepted.

## 4. Use Cloudflare Worker Secrets for Production `NOTION_TOKEN`

**Decision**

Use Cloudflare Worker secrets for the production `NOTION_TOKEN`.

**Reason**

Production secrets should live in Cloudflare's Worker secret store, not in Git or local-only `.dev.vars`.

**Status**

Planned for deployment.

## 5. Keep Data Source IDs in `wrangler.jsonc`

**Decision**

Store Notion Data Source IDs in Wrangler `vars`.

**Reason**

Data Source IDs identify resources but do not authenticate callers. They are configuration, not bearer credentials.

**Status**

Accepted.

## 6. Use TypeScript

**Decision**

Use TypeScript for Worker source.

**Reason**

Types make Worker bindings, service responses, Notion query responses, and mapper outputs easier to maintain.

**Status**

Accepted.

## 7. Use Feature-Based Source Folders

**Decision**

Organize domain code under feature folders such as `src/features/jiras/`.

**Reason**

Feature folders keep routes, services, filters, and mappers close together while shared infrastructure remains under `src/shared/`.

**Status**

Accepted.

## 8. Keep `src/index.ts` Thin

**Decision**

Keep the Worker entry point focused on bootstrapping, root response, route delegation, and fallback 404.

**Reason**

This keeps feature behavior out of the Worker bootstrap file and makes future modules easier to add safely.

**Status**

Accepted.

## 9. Perform JIRA Filtering in Notion Queries Rather Than Angular

**Decision**

Send filters to the Notion data-source query API rather than fetching all rows and filtering them in Angular.

**Reason**

Server-side Notion filtering reduces data transfer, keeps frontend code simpler, and prepares the API for better pagination.

**Status**

Accepted.

## 10. Preserve Historical Sprint/JIRA Relationships

**Decision**

Preserve historical sprint/JIRA relationships as a design goal.

**Reason**

Old JIRAs should remain queryable later by JIRA key, and sprint history should not be destroyed by removing historical relations.

**Status**

Accepted design goal.

## 11. Add Sprints and Sprint Allocations After JIRA API Stability

**Decision**

Add Sprints and Sprint Allocations after the current JIRA API and documentation are stable.

**Reason**

The JIRA feature establishes the reusable source structure and Notion integration pattern. Additional data sources should follow after that pattern is settled.

**Status**

Accepted and implemented.

## 12. Keep Node 24 in `package.json` Engines

**Decision**

Keep the Node 24 `engines` entry in `package.json`.

**Reason**

The repository owner uses it as the expected local Node version and reminder.

**Status**

Accepted.

## 14. Defer Company-Based Sprint History Until Projects/Companies Exist

**Decision**

Implement company filtering for Sprint history through the Projects data source instead of adding a direct Company relation to Sprints.

**Reason**

The Sprints data source relates to Projects, and Projects relate to Companies. Resolving Company to Project IDs keeps the Notion schema unchanged and still lets Sprints be filtered server-side in Notion.

**Status**

Accepted and implemented.

## 15. Keep Relation Names Unresolved in API Responses

**Decision**

Continue returning relation IDs such as `projectIds`, `companyIds`, and `teamIds` rather than nested related objects.

**Reason**

Relation-name resolution would add extra Notion lookups and possible N+1 behavior. It should be designed as a separate feature.

**Status**

Accepted.

## 16. Treat Work Logs as Historical Daily Records

**Decision**

Implement Work Logs as a read-only historical API and keep Work Log records independent from Sprint lifecycle cleanup.

**Reason**

A Work Log records what happened on a date. A JIRA can have multiple Work Logs, and a Work Log can exist without a JIRA. These records should remain queryable after a Sprint ends.

**Status**

Accepted and implemented.

## 17. Treat Release Items as Component-Level Read Models

**Decision**

Implement Release Items as a read-only API where one JIRA can have multiple Release Items.

**Reason**

A single ticket can release multiple components or micro-frontends. Release metadata should remain component-specific, and version values must stay as strings because real release identifiers may include dots, hashes, hyphens, prefixes, or other non-numeric content.

**Status**

Accepted and implemented.

## 13. Do Not Embed Shared Backend Credentials Inside the Android APK

**Decision**

Do not embed any shared backend credential inside the Android APK.

**Reason**

APK contents and bundled JavaScript can be inspected. Shared credentials belong in the Worker layer, not in distributed client artifacts.

**Status**

Accepted.
