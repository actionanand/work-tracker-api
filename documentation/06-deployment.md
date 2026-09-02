# Deployment

This is a future deployment guide. Do not deploy as part of documentation-only work.

## Production Flow

```text
Local Worker
    ->
test
    ->
configure Cloudflare production secret
    ->
deploy
    ->
test workers.dev endpoint
```

## Login

```bash
npx wrangler login
```

This authenticates Wrangler with the Cloudflare account that will own the deployed Worker.

## Configure Production Secret

```bash
npx wrangler secret put NOTION_TOKEN
```

The production `NOTION_TOKEN` is separate from `.dev.vars`. `.dev.vars` is local-only and is not uploaded during deployment.

The Worker code still reads:

```ts
env.NOTION_TOKEN
```

for both local and production environments.

## Deploy

```bash
npx wrangler deploy
```

The `JIRAS_DATA_SOURCE_ID` value can stay in Wrangler `vars` because it is configuration, not an authentication secret.

## Production URL

The deployed Worker will normally be available at a workers.dev URL shaped like:

```text
https://work-tracker-api.<cloudflare-subdomain>.workers.dev
```

Use the actual URL printed by Wrangler after deployment.

## Production Testing

After deployment, test the root endpoint and at least one Notion-backed endpoint:

```bash
curl -s https://work-tracker-api.<cloudflare-subdomain>.workers.dev/ | jq
curl -s https://work-tracker-api.<cloudflare-subdomain>.workers.dev/api/jiras/blocked | jq
```

Replace `<cloudflare-subdomain>` with the real workers.dev subdomain.

## Secret Rotation

To rotate the Notion token:

1. Create a replacement Notion Personal Access Token.
2. Update the Cloudflare Worker secret with `npx wrangler secret put NOTION_TOKEN`.
3. Test production endpoints.
4. Revoke the old Notion token.

## Related Docs

- [Environment Variables and Secrets](03-environment-variables-and-secrets.md)
- [Security](07-security.md)
- [Decisions](../knowledge-base/decisions.md)
