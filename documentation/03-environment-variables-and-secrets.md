# Environment Variables and Secrets

Cloudflare Workers receive configuration through environment bindings. This project uses one non-secret variable and one secret.

## Configuration Types

| Type | Purpose | Current Use |
| --- | --- | --- |
| Normal variables | Non-secret configuration stored in Wrangler config. | `JIRAS_DATA_SOURCE_ID` |
| Secrets | Sensitive values stored by Cloudflare for production. | `NOTION_TOKEN` |
| Local development secrets | Sensitive values stored only on the developer machine. | `.dev.vars` |
| Production secrets | Sensitive values stored in Cloudflare. | Future deployment secret for `NOTION_TOKEN` |

## Current Configuration

Non-secret value:

```text
JIRAS_DATA_SOURCE_ID
```

It is configured under `vars` in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "JIRAS_DATA_SOURCE_ID": "your-data-source-id"
  }
}
```

A Notion Data Source ID identifies a resource, but it does not authenticate the caller. It can be configuration. The Notion token is what grants access.

Secret value:

```text
NOTION_TOKEN
```

`NOTION_TOKEN` must never be stored in:

- `wrangler.jsonc`
- source TypeScript
- Angular `environment.ts`
- Android resources
- Git
- README
- committed shell script

## Local Development

Create `.dev.vars` at the repository root:

```text
work-tracker-api/
├── .dev.vars
├── wrangler.jsonc
└── ...
```

Example content:

```ini
NOTION_TOKEN=your_notion_token_here
```

When running:

```bash
npm run dev
```

Wrangler loads `.dev.vars` and injects its keys into the Worker environment. Inside Worker code, that value is available as:

```ts
env.NOTION_TOKEN
```

The project does not manually import `.dev.vars`.

Worker code should use:

```ts
env.NOTION_TOKEN
```

Do not use:

```ts
process.env.NOTION_TOKEN
```

unless the project is explicitly configured for a different Node-compatible environment.

## Env Interface

The current Worker binding interface is:

```ts
export interface Env {
  NOTION_TOKEN: string;
  JIRAS_DATA_SOURCE_ID: string;
}
```

This maps Cloudflare runtime bindings to TypeScript, making the expected environment shape clear to the Worker code.

## Production

`.dev.vars` remains only on the developer computer.

For production, configure the Worker secret with:

```bash
npx wrangler secret put NOTION_TOKEN
```

Do not run this as part of documentation-only work. Conceptually, the command stores the secret in Cloudflare rather than putting it in Git.

Production Worker code still accesses:

```ts
env.NOTION_TOKEN
```

The code does not need separate local and production secret-access logic.

| Environment | Secret Flow |
| --- | --- |
| Local | `.dev.vars -> Wrangler -> env.NOTION_TOKEN` |
| Production | `Cloudflare Worker Secret -> Worker runtime -> env.NOTION_TOKEN` |

## Gitignore Requirements

`.dev.vars` must remain ignored.

Useful checks:

```bash
git status
git check-ignore -v .dev.vars
```

Never force-add `.dev.vars`.

## Related Docs

- [Local Development](05-local-development.md)
- [Deployment](06-deployment.md)
- [Security](07-security.md)
