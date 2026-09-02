# Project Creation

This repository was originally created with:

```bash
npm create cloudflare@latest -- work-tracker-api
```

The generated project was then adapted into the current Work Tracker API.

## Interactive Choices

The choices used for this repository were:

| Prompt | Choice |
| --- | --- |
| First selection | Hello World example |
| Type | Worker only |
| Language | TypeScript |
| Git | Initialize a git repository: Yes |
| Deployment | Deploy now: No |

## Why Hello World Example

The Hello World example was selected because this repository needed a minimal Worker foundation, not a prebuilt application architecture.

It was preferred over:

- Framework Starter
- Application Starter

Those starters are useful when the project begins with a frontend framework, full-stack framework, or larger opinionated architecture. This API only needed a small HTTP Worker that could become a secure Notion proxy.

## Why Worker Only

Worker only was selected because the current backend is a request handler and API proxy.

The project did not need starter options such as:

- Static site
- SSR
- Durable Objects
- Queues
- Workers AI
- other starter architectures

Those options can be added later if the use case appears. Starting with a plain Worker keeps the architecture easy to understand and avoids unused platform concepts.

## Why TypeScript

TypeScript was selected to document the shape of Worker bindings, route responses, Notion query responses, and mapped JIRA objects. This project integrates with an external API whose raw JSON is nested and verbose, so types help keep mapping code safer without requiring a full Notion SDK.

## Why Deployment Was Skipped

Initial deployment was skipped because the project needed local setup first:

- configure secrets
- confirm Notion access
- implement API routes
- add tests
- verify local development behavior

The production Worker secret should be configured before deployment.

## Generated Repository Contents

A newly generated Cloudflare Worker project normally contains files such as:

```text
src/index.ts
wrangler.jsonc
package.json
package-lock.json
test/
tsconfig.json
vitest.config.mts
worker-configuration.d.ts
```

Exact generated files can vary with future versions of the Cloudflare CLI.

## Create Another Worker in the Future

Repeatable sequence:

```bash
npm create cloudflare@latest -- another-worker-name
cd another-worker-name
npm install
```

Choose:

- Hello World example
- Worker only
- TypeScript
- Initialize git repository: Yes
- Deploy now: No

Then configure local secrets, Wrangler variables, routes, tests, and production secrets before deploying.

## Related Docs

- [Environment Variables and Secrets](03-environment-variables-and-secrets.md)
- [Local Development](05-local-development.md)
- [Deployment](06-deployment.md)
