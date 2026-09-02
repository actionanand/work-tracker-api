# Local Development

This guide describes how to run the Work Tracker API locally.

## Install Dependencies

```bash
npm install
```

The repository expects Node.js 24, as recorded in `package.json`.

## Create Local Secret File

Create `.dev.vars` at the repository root:

```ini
NOTION_TOKEN=your_notion_token_here
```

`.dev.vars` is intentionally gitignored. It should only exist on the developer machine.

## Configure Non-Secret IDs

Configure non-secret data source IDs in `wrangler.jsonc`:

```jsonc
"vars": {
  "JIRAS_DATA_SOURCE_ID": "your-data-source-id"
}
```

## Start Local Worker

```bash
npm run dev
```

Wrangler starts a local development server and hot reloads when source files change.

The default local URL is normally:

```text
http://localhost:8787
```

## Manual Endpoint Checks

```bash
curl -s http://localhost:8787/ | jq
curl -s http://localhost:8787/api/jiras | jq
curl -s http://localhost:8787/api/jiras/active | jq
curl -s http://localhost:8787/api/jiras/blocked | jq
curl -s http://localhost:8787/api/jiras/spillovers | jq
curl -s http://localhost:8787/api/jiras/appraisal | jq
curl -s http://localhost:8787/api/jiras/demo-pending | jq
curl -s http://localhost:8787/api/jiras/demoed | jq
```

`jq` pretty-prints and filters terminal JSON. It is not a Worker dependency.

## Tests

Run the test suite once:

```bash
npm test -- --run
```

Run watch mode while developing:

```bash
npm test
```

Watch mode keeps Vitest running and reruns tests after changes.

## Useful Checks Before Commit

```bash
git status
git diff
git check-ignore -v .dev.vars
```

Safe commit workflow:

```bash
git status
git diff
npm test -- --run
git add README.md documentation/ knowledge-base/
git status
git commit -m "Add project documentation"
```

Do not force-add `.dev.vars`.

## Related Docs

- [Environment Variables and Secrets](03-environment-variables-and-secrets.md)
- [Deployment](06-deployment.md)
- [Security](07-security.md)
