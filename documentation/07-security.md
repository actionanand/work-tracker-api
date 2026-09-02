# Security

This project exists partly to keep the Notion Personal Access Token out of the Angular/Capacitor Android app.

## Trust Boundaries

```text
Android / Angular client
        |
        v
Cloudflare Worker
        |
        v
Notion
```

The client is not trusted with shared backend credentials. The Worker is the server-side boundary that holds credentials and calls Notion. Notion trusts the token presented by the Worker.

## Notion Token Placement

The Notion Personal Access Token stays only at the Worker layer:

- local development: `.dev.vars`
- production: Cloudflare Worker secret

It must not be embedded in the Android APK, Angular environment files, source code, documentation, committed scripts, or Wrangler config.

## CORS Is Not Authentication

CORS controls which browser origins can read responses. It does not prove who the caller is, and it does not protect an API from non-browser clients.

Hiding the Notion token behind a Worker does not automatically make the Worker endpoint private. If deployed without client authentication, the workers.dev API should be considered publicly callable.

Before distributing the Android app broadly, authentication between the Android app and Worker should be considered separately from authentication between the Worker and Notion.

Do not implement authentication until requirements are clear.

## Secrets Hygiene

Rules:

- never commit `.dev.vars`
- never print or copy real token values into documentation
- never store `NOTION_TOKEN` in `wrangler.jsonc`
- never store `NOTION_TOKEN` in Angular or Android files
- rotate a token if it is exposed

## Logging Hygiene

Never log:

```ts
env.NOTION_TOKEN
```

It is acceptable to log operational errors, but logs should avoid request headers, bearer tokens, and raw secret-bearing objects.

## Source Maps

`upload_source_maps` is currently enabled in `wrangler.jsonc`. Source maps can help debug deployed code. Secrets are runtime bindings and must never be hardcoded into source, so source maps should not contain secret values.

## Data Source IDs

Data Source IDs are configuration, not authentication secrets. A Data Source ID identifies a Notion resource. The Notion Personal Access Token is what grants access.

## Related Docs

- [Environment Variables and Secrets](03-environment-variables-and-secrets.md)
- [Worker as API Proxy](04-worker-as-api-proxy.md)
