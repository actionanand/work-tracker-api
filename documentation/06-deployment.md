# Production Deployment, Operations & Secret Rotation

This document is the production runbook for the **Work Tracker API** Cloudflare Worker.

It covers:

- first production deployment;
- repeat deployments;
- production verification;
- deployment/version status;
- live logs;
- Cloudflare Worker secrets;
- Notion Personal Access Token (PAT) rotation;
- JWT secret rotation;
- Work Tracker password rotation;
- non-secret authentication configuration;
- recovery after a bad secret change;
- recommended operational scripts.

## 1. Production architecture

```text
Angular / Capacitor application
            |
            | HTTPS REST
            v
Cloudflare Worker
work-tracker-api
            |
            | NOTION_TOKEN
            v
Notion REST API
```

The Cloudflare Worker is the security boundary.

Sensitive values such as the Notion token, password verifier, and JWT signing secret must never be placed in:

- Angular environment files;
- client-side JavaScript;
- an APK;
- `wrangler.jsonc` as plaintext;
- source code;
- Git;
- README files;
- shell scripts committed to the repository.

Production secrets belong in **Cloudflare Worker secrets**.

Local-only secrets belong in `.dev.vars`, which must remain gitignored.

---

## 2. Current production secret state

The following commands have already been successfully executed for the Worker:

```bash
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put AUTH_PASSWORD_HASH
npx wrangler secret put AUTH_PASSWORD_SALT
npx wrangler secret put AUTH_JWT_SECRET
```

During the first command, Wrangler reported that `work-tracker-api` did not yet exist and created a Worker with that name before adding the secret.

The following production secret names should therefore exist:

```text
NOTION_TOKEN
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
AUTH_JWT_SECRET
```

Check the names at any time with:

```bash
npx wrangler secret list --format pretty
```

This displays secret **names**, not their secret values.

> The successful secret upload does not replace the normal application deployment verification. Treat the production application as ready only after `npm run deploy` succeeds and the deployed API passes the smoke tests in this document.

---

## 3. Current non-secret production configuration

The project currently keeps non-sensitive settings in `wrangler.jsonc`.

Important authentication values are:

```jsonc
{
  "AUTH_PASSWORD_ITERATIONS": "600000",
  "AUTH_TOKEN_TTL_SECONDS": "3600"
}
```

`AUTH_TOKEN_TTL_SECONDS=3600` means newly issued access tokens are valid for one hour.

These values are configuration, not secrets.

Do not move Notion tokens, hashes, salts, JWT secrets, API keys, or passwords into `vars`.

---

## 4. Deployment scripts already available

The current `package.json` contains:

```json
{
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "start": "wrangler dev",
    "test": "vitest",
    "cf-typegen": "wrangler types"
  }
}
```

Their purposes are:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Worker locally with Wrangler. |
| `npm start` | Alias for local Wrangler development. |
| `npm test` | Start Vitest, normally in watch mode. |
| `npm test -- --run` | Run the test suite once and exit. Recommended before deployment. |
| `npm run deploy` | Deploy the Worker to Cloudflare. |
| `npm run cf-typegen` | Regenerate Cloudflare binding types. |

For production verification, use:

```bash
npm test -- --run
npm run deploy
```

---

## 5. Recommended operational npm scripts

The following scripts are optional, but adding them to `package.json` makes routine production operations easier:

```json
{
  "scripts": {
    "deploy": "wrangler deploy",
    "deploy:status": "wrangler deployments list",
    "deploy:versions": "wrangler versions list",
    "deploy:logs": "wrangler tail",
    "secrets:list": "wrangler secret list --format pretty",
    "dev": "wrangler dev",
    "start": "wrangler dev",
    "test": "vitest",
    "test:run": "vitest run",
    "cf-typegen": "wrangler types"
  }
}
```

Then the common commands become:

```bash
npm run test:run
npm run deploy
npm run deploy:status
npm run deploy:versions
npm run deploy:logs
npm run secrets:list
```

Do **not** create npm scripts containing actual secret values.

---

## 6. Production branch

A production release should normally be deployed from the repository's production branch after the feature is reviewed and merged.

For this repository, the default branch is `master`.

Recommended flow:

```bash
git status
git checkout master
git pull --ff-only
npm install
npm test -- --run
npm run deploy
```

If the project has a lockfile and you want a clean reproducible dependency install, `npm ci` can be used instead of `npm install`.

Do not deploy `feature/1-auth` directly to production unless that is a deliberate release decision.

---

## 7. Cloudflare authentication

Wrangler uses Cloudflare authentication independently from your Work Tracker application's JWT authentication.

Check the current Cloudflare login:

```bash
npx wrangler whoami
```

If login is required:

```bash
npx wrangler login
```

Wrangler opens the Cloudflare OAuth flow in the browser.

You do not need to run `wrangler login` before every deployment if the existing Wrangler session is still valid.

---

## 8. Pre-deployment checklist

Run these commands from the repository root:

```bash
git status
node --version
npx wrangler whoami
npx wrangler secret list --format pretty
npm test -- --run
```

Confirm:

- the intended code is checked out;
- Node.js is compatible with the project's Node 24 requirement;
- Wrangler is logged into the correct Cloudflare account;
- all four required production secrets are present;
- tests pass;
- no secret value has accidentally been added to Git.

Expected secret names:

```text
NOTION_TOKEN
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
AUTH_JWT_SECRET
```

---

## 9. First production deployment

Once the checklist passes:

```bash
npm run deploy
```

This executes:

```bash
wrangler deploy
```

Wrangler should print the deployed Worker information and its route/URL.

The Worker will normally have a URL shaped like:

```text
https://work-tracker-api.<your-workers-subdomain>.workers.dev
```

Use the exact URL printed by Wrangler or shown in the Cloudflare dashboard.

For the commands below, store it temporarily in your shell:

```bash
export API_BASE_URL='https://work-tracker-api.<your-workers-subdomain>.workers.dev'
```

This URL is not a secret.

---

## 10. How to check deployment status

A deployment should be considered healthy only when all three checks pass:

```text
1. Deployment exists
2. Worker responds correctly
3. Runtime logs show no unexpected errors
```

### 10.1 List recent deployments

```bash
npx wrangler deployments list
```

This shows recent deployments for `work-tracker-api`.

With the optional npm script:

```bash
npm run deploy:status
```

### 10.2 List recent Worker versions

```bash
npx wrangler versions list
```

With the optional npm script:

```bash
npm run deploy:versions
```

This is useful when checking whether a deployment or secret change created a new Worker version.

### 10.3 List configured secrets

```bash
npx wrangler secret list --format pretty
```

or:

```bash
npm run secrets:list
```

This verifies that the required secret bindings exist without revealing the values.

### 10.4 Check the Cloudflare dashboard

Open Cloudflare Dashboard and navigate to the `work-tracker-api` Worker.

Check:

- Deployments / Versions;
- Logs;
- invocation/error information;
- the production workers.dev route.

The CLI plus HTTP smoke tests are still recommended even when the dashboard reports a successful deployment.

---

## 11. Production health check

The root route is public.

Run:

```bash
curl -fsS "$API_BASE_URL/" | jq
```

Expected response:

```json
{
  "name": "Work Tracker API",
  "status": "ok"
}
```

If `jq` is not installed:

```bash
curl -fsS "$API_BASE_URL/"
```

A successful root response proves that the Worker is reachable, but it does **not** prove that authentication or Notion access is working.

---

## 12. Full authenticated production smoke test

All `/api/*` routes except the login route and `OPTIONS` preflight requests require a bearer token.

Do not write the Work Tracker password directly into a command that will remain in shell history.

### 12.1 Read the password without echoing it

```bash
read -rsp "Work Tracker password: " WORK_TRACKER_PASSWORD
echo
```

### 12.2 Log in and capture the access token

```bash
TOKEN=$(
  curl -fsS "$API_BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data "$(jq -nc --arg password "$WORK_TRACKER_PASSWORD" '{password:$password}')" \
  | jq -r '.accessToken'
)
```

Immediately remove the password variable:

```bash
unset WORK_TRACKER_PASSWORD
```

Verify that a token was returned:

```bash
test -n "$TOKEN" && test "$TOKEN" != "null" && echo "Login successful"
```

### 12.3 Check authenticated status

```bash
curl -fsS "$API_BASE_URL/api/auth/status" \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

### 12.4 Check one Notion-backed endpoint

For example:

```bash
curl -fsS "$API_BASE_URL/api/jiras/blocked" \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

You can also check:

```bash
curl -fsS "$API_BASE_URL/api/sprints/active" \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

The Notion-backed request is important because it verifies:

```text
Client request
   -> JWT verification
   -> Cloudflare Worker
   -> NOTION_TOKEN
   -> Notion API
   -> response
```

Finally:

```bash
unset TOKEN
```

---

## 13. Production logs

The project has Cloudflare observability enabled in `wrangler.jsonc`:

```jsonc
"observability": {
  "enabled": true
}
```

It also uploads source maps:

```jsonc
"upload_source_maps": true
```

### Live logs from the terminal

Run:

```bash
npx wrangler tail
```

or:

```bash
npm run deploy:logs
```

Keep that terminal open and invoke the API from another terminal.

For example:

```bash
curl -fsS "$API_BASE_URL/" | jq
```

Then perform login and a Notion-backed request.

Watch for:

- uncaught exceptions;
- Notion `401`/`403` errors;
- authentication failures;
- `500` responses;
- unexpected route errors.

### Dashboard logs

You can also use the Cloudflare Worker's Logs view.

Live tail logs are especially useful immediately after:

- an application deployment;
- a Notion token rotation;
- JWT secret rotation;
- password verifier rotation;
- a `wrangler.jsonc` configuration change.

---

# Secret Management

## 14. Production secret inventory

| Secret | Purpose | Routine expiry? | Effect of replacement |
| --- | --- | --- | --- |
| `NOTION_TOKEN` | Authenticates Worker requests to Notion. | Yes, for the current Notion PAT model: one year after creation. | New Notion calls use the replacement token. |
| `AUTH_PASSWORD_HASH` | PBKDF2 verifier for the Work Tracker login password. | No fixed expiry. | Changes which password can successfully log in. |
| `AUTH_PASSWORD_SALT` | Salt paired with `AUTH_PASSWORD_HASH`. | No fixed expiry. | Must match the password hash. |
| `AUTH_JWT_SECRET` | HMAC signing key for access tokens. | No fixed expiry imposed by this app. | Immediately invalidates tokens signed by the previous key. |

Never copy secret values into this document.

---

## 15. General secret rotation procedure

For a normal secret replacement, use:

```bash
npx wrangler secret put SECRET_NAME
```

Example:

```bash
npx wrangler secret put NOTION_TOKEN
```

Wrangler prompts securely:

```text
Enter a secret value:
```

Paste the new secret when prompted.

### Recommended rotation order

```text
1. Generate/create replacement credential
2. Keep old credential valid temporarily, when possible
3. Put replacement into Cloudflare
4. Verify secret name exists
5. Verify deployment/version
6. Run production health check
7. Run functional smoke test
8. Check logs
9. Revoke old credential at its source
10. Record rotation date and next expiry date — never the secret itself
```

Commands:

```bash
npx wrangler secret put SECRET_NAME
npx wrangler secret list --format pretty
npx wrangler deployments list
npx wrangler versions list
npx wrangler tail
```

A normal `wrangler secret put` updates the Worker secret without requiring you to edit source code.

Cloudflare handles the secret as an encrypted Worker binding.

### Do not delete before replacing

Avoid:

```bash
npx wrangler secret delete NOTION_TOKEN
```

followed later by a new value.

That creates an unnecessary outage.

Instead, replace the existing key directly:

```bash
npx wrangler secret put NOTION_TOKEN
```

Use `secret delete` only when the application no longer needs a secret.

---

# Notion Token Rotation

## 16. Notion PAT lifetime

This project currently uses `NOTION_TOKEN` as a **Notion Personal Access Token (PAT)**.

Current Notion behavior is:

```text
PAT creation
    |
    +--> valid for up to one year
    |
    +--> expires
            |
            +--> Notion API requests fail until a valid token is supplied
```

A PAT expires one year after creation.

Do not plan to rotate it on the expiry date itself.

Recommended operational policy:

```text
Create PAT
   |
   +-- Month 10/11: rotation reminder
   |
   +-- 14-30 days before expiry: rotate
   |
   +-- verify production
   |
   +-- revoke old PAT
```

Record metadata such as:

```text
Token name: work-tracker-api-production
Created: YYYY-MM-DD
Expires: YYYY-MM-DD
Rotate by: YYYY-MM-DD
Owner: <name/account>
```

Do **not** record the actual token value in Git or in this file.

---

## 17. Creating the replacement Notion PAT

In Notion:

1. Open the Notion Developer portal.
2. Open **Personal access tokens**.
3. Create a new PAT for the correct workspace.
4. Give it the Notion API capability required by this application.
5. Copy the new token and store it securely.
6. Keep the old PAT active until the new PAT has been verified in production.

Because this application is a personal/user-owned Work Tracker, a PAT is suitable for the current architecture.

---

## 18. Test the new Notion PAT before switching production

The current Worker uses:

```text
Notion-Version: 2026-03-11
```

You can test a newly created PAT without putting it on the command line.

```bash
read -rsp "New Notion PAT: " NEW_NOTION_TOKEN
echo
```

Then:

```bash
curl -fsS https://api.notion.com/v1/users/me \
  -H "Authorization: Bearer $NEW_NOTION_TOKEN" \
  -H "Notion-Version: 2026-03-11" \
  | jq
```

After the test:

```bash
unset NEW_NOTION_TOKEN
```

If the request succeeds, proceed with production rotation.

---

## 19. Rotate `NOTION_TOKEN` in Cloudflare

Run:

```bash
npx wrangler secret put NOTION_TOKEN
```

Paste the new PAT at the secure prompt.

Then verify:

```bash
npx wrangler secret list --format pretty
npx wrangler deployments list
npx wrangler versions list
```

You do not need to change TypeScript code because the Worker already reads:

```ts
env.NOTION_TOKEN
```

---

## 20. Verify production after Notion token rotation

The root endpoint alone is not enough, because `/` does not need Notion.

First obtain a Work Tracker JWT using the normal login flow, then test a Notion-backed route:

```bash
curl -fsS "$API_BASE_URL/api/sprints/active" \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

Or:

```bash
curl -fsS "$API_BASE_URL/api/jiras/blocked" \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

At the same time:

```bash
npx wrangler tail
```

Only after a Notion-backed production request succeeds should the old Notion PAT be revoked.

---

## 21. Revoke the previous Notion PAT

After successful production verification:

1. Return to Notion's Personal access token management.
2. Find the previous token.
3. Revoke it.
4. Confirm the application still works.
5. Record the new creation and expiry dates in your private operational record.

Once revoked, the old token should no longer be usable.

---

## 22. If the Notion PAT expires before rotation

Symptoms can include errors such as:

```text
Notion API 401: ...
```

because `src/shared/notion/notion-client.ts` throws an error when Notion returns a non-success response.

Recovery:

```text
Create new Notion PAT
        |
        v
Test new PAT
        |
        v
npx wrangler secret put NOTION_TOKEN
        |
        v
Test authenticated Notion-backed Worker endpoint
        |
        v
Check wrangler tail
```

No application code change is required purely because the Notion PAT expired.

---

# JWT Secret Rotation

## 23. Can `AUTH_JWT_SECRET` be changed later?

**Yes.**

The JWT signing secret can be rotated at any time.

The current implementation signs and verifies JWT access tokens using the single value:

```text
AUTH_JWT_SECRET
```

Therefore:

```text
Old JWT secret
      |
      +--> existing JWTs are valid

Replace AUTH_JWT_SECRET
      |
      +--> old JWTs fail signature verification
      |
      +--> users/clients must log in again
      |
      +--> new login creates JWT signed with new secret
```

This is expected behavior.

With the current:

```text
AUTH_TOKEN_TTL_SECONDS=3600
```

tokens would normally live for at most one hour, but changing the signing secret invalidates old tokens immediately rather than waiting for that hour to finish.

---

## 24. Generate a new JWT signing secret

Generate a fresh independent value:

```bash
openssl rand -hex 32
```

Do not reuse:

- the Work Tracker password;
- the password hash;
- the password salt;
- the Notion PAT;
- another application's JWT secret.

Do not commit the generated value.

---

## 25. Rotate the JWT secret

If you want to prove that old tokens are invalidated, obtain an access token before rotation and temporarily keep it as:

```bash
OLD_TOKEN='<existing-access-token>'
```

Do not save it to a file.

Generate the new secret:

```bash
openssl rand -hex 32
```

Then update Cloudflare:

```bash
npx wrangler secret put AUTH_JWT_SECRET
```

Paste the newly generated secret.

Verify the Worker state:

```bash
npx wrangler secret list --format pretty
npx wrangler deployments list
npx wrangler versions list
```

Now log in again to obtain a new JWT.

The new token should succeed:

```bash
curl -i "$API_BASE_URL/api/auth/status" \
  -H "Authorization: Bearer $TOKEN"
```

The old token should fail:

```bash
curl -i "$API_BASE_URL/api/auth/status" \
  -H "Authorization: Bearer $OLD_TOKEN"
```

Expected behavior for the old token is an authentication failure, normally HTTP `401`.

Clean the variables:

```bash
unset TOKEN
unset OLD_TOKEN
```

---

## 26. When should JWT rotation be performed?

Rotate `AUTH_JWT_SECRET` when:

- you suspect the secret was exposed;
- a device or system containing the secret was compromised;
- you intentionally want to invalidate all active sessions;
- you adopt a periodic key rotation policy.

For an exposure/security incident, rotate it immediately.

For a planned rotation, expect all currently logged-in clients to authenticate again.

### Zero-disruption JWT rotation

The current code supports one JWT signing secret only.

A grace period where both old and new tokens remain valid would require an application change, for example:

```text
AUTH_JWT_SECRET_CURRENT
AUTH_JWT_SECRET_PREVIOUS
```

and verification logic that temporarily accepts signatures from both keys.

That is **not** how the current Worker works, so do not assume zero-disruption JWT rotation today.

For this personal application, immediate invalidation plus re-login is simpler and safer.

---

# Work Tracker Password Rotation

## 27. Password authentication secrets

The login password itself is not stored in Cloudflare.

The application stores:

```text
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
```

The project generates them using PBKDF2 with SHA-256.

Current iteration configuration:

```text
AUTH_PASSWORD_ITERATIONS=600000
```

The hash, salt, and iteration count form one verifier configuration.

---

## 28. Generate a new password verifier

Run:

```bash
node scripts/generate-auth-password.mjs
```

The script asks for the new password without echoing it and outputs:

```text
AUTH_PASSWORD_HASH=...
AUTH_PASSWORD_SALT=...
AUTH_PASSWORD_ITERATIONS=600000
```

The password itself is not written into `wrangler.jsonc`.

---

## 29. Rotate password hash and salt

`AUTH_PASSWORD_HASH` and `AUTH_PASSWORD_SALT` belong together.

Do not intentionally keep:

```text
new hash + old salt
```

or:

```text
old hash + new salt
```

because login verification will fail.

### Simple CLI procedure

During a low-usage period:

```bash
npx wrangler secret put AUTH_PASSWORD_HASH
npx wrangler secret put AUTH_PASSWORD_SALT
```

Enter the newly generated matching values.

Because these are two separate secret changes, there can be a short interval between commands where login is not possible.

Existing already-issued JWTs are unaffected because JWT verification uses `AUTH_JWT_SECRET`, not the password hash.

### Preferred paired update

Wrangler supports updating multiple secrets in one bulk request.

For sensitive paired values such as the password hash and salt, prefer a bulk update or update both values together through the Cloudflare dashboard so that they are changed as one operational action.

If using Wrangler bulk secrets, create a protected temporary file **outside the repository**:

```bash
umask 077
PASSWORD_SECRET_FILE="$(mktemp)"
```

Edit the file and put only:

```json
{
  "AUTH_PASSWORD_HASH": "<new-hash>",
  "AUTH_PASSWORD_SALT": "<new-salt>"
}
```

Apply both:

```bash
npx wrangler secret bulk "$PASSWORD_SECRET_FILE"
```

Delete the temporary file immediately:

```bash
rm -f "$PASSWORD_SECRET_FILE"
unset PASSWORD_SECRET_FILE
```

Never commit or retain that temporary file.

After the update, log in with the **new password** and run:

```bash
curl -fsS "$API_BASE_URL/api/auth/status" \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

The old password should no longer be able to obtain a new JWT.

---

## 30. Should JWT also be rotated when the login password changes?

There are two valid choices.

### Password change only

Rotate:

```text
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
```

Result:

- future logins require the new password;
- already-issued JWTs remain valid until their expiration time.

This is usually fine for a normal planned password change.

### Password change + force logout everywhere

Rotate:

```text
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
AUTH_JWT_SECRET
```

Result:

- new login requires the new password;
- every old JWT becomes invalid immediately;
- all clients must log in again.

Use this when:

- the old password may have been compromised;
- an existing JWT may have been exposed;
- you want a complete authentication reset.

---

# Non-secret Auth Configuration Changes

## 31. Changing `AUTH_TOKEN_TTL_SECONDS`

Current setting:

```jsonc
"AUTH_TOKEN_TTL_SECONDS": "3600"
```

This can be changed later in `wrangler.jsonc`.

Example:

```jsonc
"AUTH_TOKEN_TTL_SECONDS": "1800"
```

Then deploy:

```bash
npm test -- --run
npm run deploy
```

Important behavior:

- newly created tokens use the new TTL;
- existing JWTs retain the `exp` claim they already contain;
- changing the TTL does not automatically invalidate existing JWTs;
- rotate `AUTH_JWT_SECRET` as well if immediate invalidation is required.

---

## 32. Changing `AUTH_PASSWORD_ITERATIONS`

Do **not** change only:

```text
AUTH_PASSWORD_ITERATIONS
```

while keeping the current hash and salt.

The password verifier depends on the iteration count.

If you decide to change the PBKDF2 iteration count:

```text
1. Choose new AUTH_PASSWORD_ITERATIONS
2. Generate a new password hash + salt using that count
3. Update wrangler.jsonc
4. Update AUTH_PASSWORD_HASH
5. Update AUTH_PASSWORD_SALT
6. Deploy/verify as one coordinated authentication change
```

The generation script supports using the environment variable:

```bash
AUTH_PASSWORD_ITERATIONS=700000 node scripts/generate-auth-password.mjs
```

Then update `wrangler.jsonc` to the same value:

```jsonc
"AUTH_PASSWORD_ITERATIONS": "700000"
```

The configured value and the value used to create the verifier must match.

---

# Recovery and Troubleshooting

## 33. Secret change failed

First inspect:

```bash
npx wrangler secret list --format pretty
npx wrangler deployments list
npx wrangler versions list
```

Then run:

```bash
npx wrangler tail
```

Test:

```bash
curl -i "$API_BASE_URL/"
```

and the relevant authenticated route.

---

## 34. Restore the previous secret

If a replacement secret is bad and the previous value is still valid, put the previous value back:

```bash
npx wrangler secret put SECRET_NAME
```

Example:

```bash
npx wrangler secret put NOTION_TOKEN
```

Then repeat the smoke test.

This is why, during a planned Notion PAT rotation, you should **not revoke the old PAT until the new PAT has successfully passed the production test**.

---

## 35. Notion-backed endpoint fails but root succeeds

If:

```bash
curl "$API_BASE_URL/"
```

works, but a Notion-backed route fails, investigate:

```text
NOTION_TOKEN
Notion PAT expiration/revocation
Notion permissions
Notion API response
Notion data source IDs
```

Use:

```bash
npx wrangler tail
```

The current Notion client reports non-success Notion responses using a message shaped like:

```text
Notion API <status>: <response>
```

---

## 36. Login fails but root works

Check:

```text
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
AUTH_PASSWORD_ITERATIONS
AUTH_JWT_SECRET
```

If the password hash or salt was recently rotated, confirm they are a matching pair generated from:

```bash
node scripts/generate-auth-password.mjs
```

If `AUTH_PASSWORD_ITERATIONS` changed, confirm the hash was generated using exactly the same iteration count.

---

## 37. Existing JWT suddenly returns 401

Possible reasons:

```text
JWT expired
AUTH_JWT_SECRET was rotated
token is malformed
token was signed by another environment/key
```

If the JWT secret was intentionally rotated, this is expected.

Log in again and use the newly issued token.

---

# Routine Production Procedure

## 38. Normal code deployment

Recommended commands:

```bash
git checkout master
git pull --ff-only
npm install
npm test -- --run
npx wrangler whoami
npx wrangler secret list --format pretty
npm run deploy
npx wrangler deployments list
npx wrangler versions list
```

Then:

```bash
export API_BASE_URL='https://work-tracker-api.<your-workers-subdomain>.workers.dev'
curl -fsS "$API_BASE_URL/" | jq
```

Run authenticated login/status and at least one Notion-backed smoke test.

Finally inspect:

```bash
npx wrangler tail
```

---

## 39. Normal secret-only change

```bash
npx wrangler secret put SECRET_NAME
npx wrangler secret list --format pretty
npx wrangler deployments list
npx wrangler versions list
```

Then test the functionality affected by that secret.

For `NOTION_TOKEN`, test a Notion-backed route.

For `AUTH_JWT_SECRET`, perform a fresh login and `/api/auth/status`.

For password hash/salt, perform a fresh login with the new password.

---

## 40. Suggested secret rotation schedule

| Item | Suggested handling |
| --- | --- |
| Notion PAT | Mandatory replacement before its one-year expiry. Schedule a reminder 30 days before expiry. |
| JWT secret | Rotate on suspected exposure and optionally on a periodic security schedule. |
| Login password hash/salt | Rotate when changing the Work Tracker password or after suspected compromise. |
| Password iteration count | Do not rotate routinely without reason; treat it as a coordinated verifier migration. |

For the Notion PAT, also keep a calendar reminder rather than relying on the application to remind you.

Suggested reminder:

```text
Work Tracker: rotate production Notion PAT
Due: 30 days before PAT expiry
```

---

# Quick Command Reference

## 41. Cloudflare identity

```bash
npx wrangler whoami
npx wrangler login
```

## 42. Tests

```bash
npm test -- --run
```

## 43. Deploy

```bash
npm run deploy
```

Equivalent:

```bash
npx wrangler deploy
```

## 44. Deployment status

```bash
npx wrangler deployments list
npx wrangler versions list
```

## 45. Logs

```bash
npx wrangler tail
```

## 46. Secret names

```bash
npx wrangler secret list --format pretty
```

## 47. Create or replace one secret

```bash
npx wrangler secret put SECRET_NAME
```

Examples:

```bash
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put AUTH_PASSWORD_HASH
npx wrangler secret put AUTH_PASSWORD_SALT
npx wrangler secret put AUTH_JWT_SECRET
```

## 48. Update multiple secrets

```bash
npx wrangler secret bulk <protected-secrets-file>
```

Use this particularly when related secrets such as the password hash and salt should be changed together.

## 49. Delete a secret

Only when the application no longer needs it:

```bash
npx wrangler secret delete SECRET_NAME
```

Do not use delete as the first step of normal rotation.

## 50. Generate password verifier

```bash
node scripts/generate-auth-password.mjs
```

## 51. Generate JWT secret

```bash
openssl rand -hex 32
```

## 52. Root health test

```bash
curl -fsS "$API_BASE_URL/" | jq
```

---

# Production Release Checklist

Use this for each production release:

```text
[ ] Correct production branch checked out
[ ] Working tree reviewed
[ ] Dependencies installed
[ ] Tests pass
[ ] Correct Cloudflare account confirmed
[ ] Required secret names confirmed
[ ] Deployment succeeds
[ ] Latest deployment/version visible
[ ] Root health endpoint succeeds
[ ] Login succeeds
[ ] /api/auth/status succeeds
[ ] At least one Notion-backed endpoint succeeds
[ ] Live logs checked
[ ] No secrets committed to Git
```

For Notion PAT rotation:

```text
[ ] New PAT created
[ ] New PAT tested directly
[ ] Old PAT kept active during cutover
[ ] NOTION_TOKEN replaced in Cloudflare
[ ] Notion-backed Worker endpoint succeeds
[ ] Logs checked
[ ] Old PAT revoked
[ ] New PAT creation/expiry/rotation dates recorded
```

For JWT rotation:

```text
[ ] New random JWT secret generated
[ ] AUTH_JWT_SECRET replaced
[ ] Fresh login succeeds
[ ] New JWT succeeds
[ ] Old JWT fails, if explicitly tested
[ ] Clients re-authenticated as required
[ ] Logs checked
```

For password rotation:

```text
[ ] New password chosen
[ ] New hash/salt generated
[ ] Hash and salt changed together
[ ] New password login succeeds
[ ] Old password cannot create a new token
[ ] Decide whether JWT secret must also be rotated
[ ] Logs checked
```

---

# Important Rules

1. **Never commit `.dev.vars`.**
2. **Never put a production secret in `wrangler.jsonc`.**
3. **Never put the Notion PAT in Angular or Capacitor client code.**
4. **Never write a password directly into a reusable shell command.**
5. **Replace secrets with `secret put`; do not delete first.**
6. **Keep the old Notion PAT valid until the new one is proven in production.**
7. **Changing `AUTH_JWT_SECRET` intentionally invalidates every currently issued JWT.**
8. **Change `AUTH_PASSWORD_HASH` and `AUTH_PASSWORD_SALT` as a pair.**
9. **Do not change `AUTH_PASSWORD_ITERATIONS` without regenerating the verifier.**
10. **A successful Cloudflare deployment is not enough; perform HTTP and Notion-backed smoke tests.**

---

## External documentation used for this runbook

This runbook is aligned with the current documentation for:

- Cloudflare Workers secrets and Wrangler secret operations;
- Cloudflare Workers deployments/versions and real-time logs;
- Notion Personal Access Tokens;
- the current `work-tracker-api` `feature/1-auth` source, including its JWT implementation, Notion client, Wrangler configuration, package scripts, and password generation script.

Update this runbook whenever authentication architecture, Worker environments, CI/CD, or secret storage strategy changes.
