# Authentication

The Work Tracker API uses single-user bearer authentication.

## Public Routes

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Health/root response. |
| `POST` | `/api/auth/login` | Login with the configured Work Tracker password. |
| `OPTIONS` | Any path | CORS preflight response. |

All other `/api/*` routes require:

```http
Authorization: Bearer <accessToken>
```

## Login

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "password": "your_work_tracker_password_here",
  "device": {
    "deviceId": "optional-stable-installation-id",
    "name": "Optional device name",
    "platform": "android",
    "model": "Optional model",
    "appVersion": "Optional app version"
  }
}
```

The `device` object is optional and is used only for display in the session/device list. It is not an authorization factor.

Successful response:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": "2026-09-03T12:00:00.000Z",
  "renewAfter": "2026-09-03T11:45:00.000Z",
  "sessionExpiresAt": "2026-09-03T19:00:00.000Z"
}
```

Invalid login request bodies return HTTP 400:

```json
{
  "error": "Invalid login request"
}
```

Wrong credentials return HTTP 401:

```json
{
  "error": "Invalid credentials"
}
```

Too many login attempts return HTTP 429:

```json
{
  "error": "Too many login attempts"
}
```

Authentication service errors return HTTP 500:

```json
{
  "error": "Authentication service unavailable"
}
```

## Token Status

```http
GET /api/auth/status
Authorization: Bearer <accessToken>
```

```json
{
  "authenticated": true,
  "subject": "owner",
  "expiresAt": "2026-09-03T12:00:00.000Z",
  "renewAfter": "2026-09-03T11:45:00.000Z",
  "sessionStartedAt": "2026-09-03T11:00:00.000Z",
  "sessionExpiresAt": "2026-09-03T19:00:00.000Z"
}
```

Missing, malformed, expired, or invalid tokens return the same generic HTTP 401 response:

```json
{
  "error": "Unauthorized"
}
```

## Sliding Session Renewal

```http
POST /api/auth/renew
Authorization: Bearer <currentAccessToken>
```

Renewal is protected and requires a still-valid access token with an active D1-backed server-side session. It does not use the login rate limiter, does not call Notion, and does not use refresh tokens.

Policy:

- Access token lifetime: 3600 seconds / 1 hour.
- Renewal window: final 900 seconds / 15 minutes before token expiry.
- Absolute session lifetime: 28800 seconds / 8 hours from the original password login.

When the current token has more than 15 minutes remaining, renewal is not yet needed:

```json
{
  "renewed": false,
  "expiresAt": "2026-09-03T12:00:00.000Z",
  "renewAfter": "2026-09-03T11:45:00.000Z",
  "sessionStartedAt": "2026-09-03T11:00:00.000Z",
  "sessionExpiresAt": "2026-09-03T19:00:00.000Z"
}
```

When renewal is allowed:

```json
{
  "renewed": true,
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": "2026-09-03T12:45:00.000Z",
  "renewAfter": "2026-09-03T12:30:00.000Z",
  "sessionStartedAt": "2026-09-03T11:00:00.000Z",
  "sessionExpiresAt": "2026-09-03T19:00:00.000Z"
}
```

`expiresIn` can be less than 3600 near the absolute session limit. The Worker never issues a token whose expiry is later than `sessionStartedAt + AUTH_MAX_SESSION_SECONDS`.

After the absolute session lifetime is reached:

```json
{
  "error": "Reauthentication required"
}
```

Expired access tokens cannot be renewed. The previous token is not deleted after renewal and may remain valid until its own `exp`, unless the backing D1 session is revoked or expires.

JWT-compatible access tokens include `sid` as the stable server-side session ID, `jti` as the per-token identifier, and `sessionStartedAt` as a NumericDate. The `sid` remains the same across renewals, while `jti` changes for each token and is not stored in D1.

Tokens issued before `sid` existed are rejected with HTTP 401. The user needs one fresh password login to create a D1-backed session.

PIN or biometric checks in Office Orbit are local app locking only. They cannot renew backend authentication without a valid Worker access token.

## Active Sessions

The Worker stores active session metadata in D1 through the `AUTH_DB` binding. The database stores only revocation/session metadata:

- session ID
- subject
- optional display-only device metadata
- request metadata such as user agent, IP address, and country
- created, last-seen, expiry, and revoked timestamps

It does not store JWTs, JWT IDs, passwords, password hashes, JWT signing secrets, or Notion tokens.

Every protected `/api/*` request must pass both checks:

- the bearer JWT verifies cryptographically
- the matching D1 session exists for the token subject, is not revoked, and has not expired

If D1 is unavailable, authentication fails closed with HTTP 401 for protected routes. Revoked, deleted, expired, malformed, or sid-less sessions also return the same generic HTTP 401 response.

`last_seen_at` writes are throttled to avoid writing on every request. The active session row is still checked on every protected request.

### Session Endpoints

```http
GET /api/auth/sessions
Authorization: Bearer <accessToken>
```

Returns active sessions for the current subject only. Call this on demand, such as when opening a device-management screen; do not poll it in the background.

```json
{
  "sessions": [
    {
      "id": "session-id",
      "current": true,
      "device": {
        "deviceId": "optional-stable-installation-id",
        "name": "Optional device name",
        "platform": "android",
        "model": "Optional model",
        "appVersion": "Optional app version"
      },
      "ipAddress": "203.0.113.10",
      "country": "IN",
      "createdAt": "2026-09-03T11:00:00.000Z",
      "lastSeenAt": "2026-09-03T11:10:00.000Z",
      "expiresAt": "2026-09-03T19:00:00.000Z"
    }
  ]
}
```

```http
DELETE /api/auth/sessions/:sessionId
Authorization: Bearer <accessToken>
```

Revokes the target session only when it belongs to the current subject. The operation is idempotent and may revoke the current session.

```json
{
  "success": true,
  "sessionId": "session-id",
  "currentSession": false
}
```

```http
POST /api/auth/sessions/logout-others
Authorization: Bearer <accessToken>
```

Revokes all active sessions for the current subject except the current session.

```json
{
  "success": true,
  "revokedCount": 2
}
```

```http
POST /api/auth/logout
Authorization: Bearer <accessToken>
```

Revokes the current session.

```json
{
  "success": true
}
```

## Configuration

Local development uses `.dev.vars`, which is intentionally gitignored:

```ini
NOTION_TOKEN=your_notion_token_here
AUTH_PASSWORD_HASH=generated_hash_here
AUTH_PASSWORD_SALT=generated_salt_here
AUTH_JWT_SECRET=your_independent_jwt_signing_secret_here
```

Generate `AUTH_PASSWORD_HASH` and `AUTH_PASSWORD_SALT` locally:

```bash
node scripts/generate-auth-password.mjs
```

The generator prompts for the password interactively and does not print the original password.

`AUTH_JWT_SECRET` must be independent of password verification. `AUTH_TOKEN_TTL_SECONDS`, `AUTH_RENEW_WINDOW_SECONDS`, and `AUTH_MAX_SESSION_SECONDS` are non-secret Wrangler configuration. Accepted TTL values are 300 through 86400 seconds. `AUTH_RENEW_WINDOW_SECONDS` must be greater than 0 and less than `AUTH_TOKEN_TTL_SECONDS`. `AUTH_MAX_SESSION_SECONDS` must be at least `AUTH_TOKEN_TTL_SECONDS` and no more than 86400 seconds.

`AUTH_PASSWORD_ITERATIONS` is non-secret Wrangler configuration. The Worker uses PBKDF2-HMAC-SHA256 with 100000 iterations for Cloudflare Workers Web Crypto compatibility. This is lower than general higher-work-factor PBKDF2 recommendations, so login is also protected by the Cloudflare `AUTH_RATE_LIMITER` binding.

A verifier generated with one iteration count cannot be reused with another. Changing `AUTH_PASSWORD_ITERATIONS` requires regenerating both `AUTH_PASSWORD_HASH` and `AUTH_PASSWORD_SALT` from the chosen login password:

```bash
node scripts/generate-auth-password.mjs
```

Then update local `.dev.vars`:

```ini
AUTH_PASSWORD_HASH=generated_hash_here
AUTH_PASSWORD_SALT=generated_salt_here
```

And update production secrets:

```bash
npx wrangler secret put AUTH_PASSWORD_HASH
npx wrangler secret put AUTH_PASSWORD_SALT
```

`AUTH_JWT_SECRET` does not need to be regenerated when changing the password verifier. `NOTION_TOKEN` is unrelated and does not need to be regenerated.

Production secrets should be configured with Wrangler secrets:

```bash
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put AUTH_PASSWORD_HASH
npx wrangler secret put AUTH_PASSWORD_SALT
npx wrangler secret put AUTH_JWT_SECRET
```

Login requests are rate limited by the `AUTH_RATE_LIMITER` Cloudflare Rate Limit binding.

Active session revocation requires a D1 binding:

```jsonc
"d1_databases": [
  {
    "binding": "AUTH_DB",
    "database_name": "work-tracker-auth",
    "database_id": "<database_id_from_wrangler_d1_create>"
  }
]
```

Create the database, apply the migration, and regenerate Worker types after the real `database_id` is in `wrangler.jsonc`:

```bash
npx wrangler d1 create work-tracker-auth
npx wrangler d1 migrations apply work-tracker-auth --local
npx wrangler d1 migrations apply work-tracker-auth --remote
npx wrangler types
```

## Local CLI Verification

Use the following commands to verify the complete authentication flow locally. Keep `npm run dev` running in one terminal and use a second terminal for the checks.

### 1. Verify local secret configuration

Confirm `.dev.vars` is ignored by Git:

```bash
git check-ignore -v .dev.vars
```

List only the variable names, not their values:

```bash
cut -d= -f1 .dev.vars
```

Expected secret names:

```text
NOTION_TOKEN
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
AUTH_JWT_SECRET
```

`AUTH_PASSWORD_ITERATIONS` and `AUTH_TOKEN_TTL_SECONDS` are non-secret Wrangler configuration and should normally remain in `wrangler.jsonc`.
`AUTH_RENEW_WINDOW_SECONDS` and `AUTH_MAX_SESSION_SECONDS` are also non-secret Wrangler configuration and should normally remain in `wrangler.jsonc`.

### 2. Start the local Worker

```bash
npm run dev
```

Wrangler should show the secret bindings as `(hidden)` and the non-secret auth configuration values normally.

### 3. Verify the public health endpoint

```bash
curl -sS -i http://localhost:8787/
```

Expected: HTTP 200.

### 4. Verify protected routes reject anonymous access

```bash
curl -sS -i http://localhost:8787/api/dashboard
```

Expected: HTTP 401 with a generic `Unauthorized` response.

### 5. Enter the login password safely

Use the same password that was used to generate `AUTH_PASSWORD_HASH`. `read -s` prevents the password from being echoed or stored directly in shell history.

```bash
read -s -p "Login password: " AUTH_PASSWORD_INPUT
echo
```

### 6. Login from the CLI

```bash
LOGIN_RESPONSE=$(curl -sS \
  -X POST \
  http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg password "$AUTH_PASSWORD_INPUT" '{password:$password}')")
```

Clear the plaintext password variable immediately:

```bash
unset AUTH_PASSWORD_INPUT
```

Inspect the login result without printing the JWT:

```bash
echo "$LOGIN_RESPONSE" | jq '{
  tokenType,
  expiresIn,
  expiresAt,
  renewAfter,
  sessionExpiresAt,
  accessTokenReceived: (.accessToken != null),
  error
}'
```

Expected:

```json
{
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": "2026-09-03T12:00:00.000Z",
  "renewAfter": "2026-09-03T11:45:00.000Z",
  "sessionExpiresAt": "2026-09-03T19:00:00.000Z",
  "accessTokenReceived": true,
  "error": null
}
```

### 7. Store the temporary access token

```bash
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken // empty')
```

Verify only that a token was received:

```bash
[ -n "$TOKEN" ] && echo "Token received" || echo "Token missing"
```

Do not print or paste the token.

### 8. Verify token status

```bash
curl -sS \
  http://localhost:8787/api/auth/status \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

Expected: `authenticated` is `true`, `subject` is `owner`, and `expiresAt` contains the expiry timestamp.

### 8a. List active sessions without printing secrets

```bash
curl -sS \
  http://localhost:8787/api/auth/sessions \
  -H "Authorization: Bearer $TOKEN" \
  | jq
```

Expected: a `sessions` array with the current session first. No JWT, `jti`, password, password hash, salt, JWT secret, or Notion token should appear in the response.

### 8b. Check renewal without printing the JWT

```bash
RENEW_RESPONSE=$(curl -sS \
  -X POST \
  http://localhost:8787/api/auth/renew \
  -H "Authorization: Bearer $TOKEN")

echo "$RENEW_RESPONSE" | jq '{
  renewed,
  tokenType,
  expiresIn,
  expiresAt,
  renewAfter,
  sessionExpiresAt,
  accessTokenReceived: (.accessToken != null),
  error
}'
```

Early renewal requests return `renewed: false` and no `accessToken`. Inside the final 15 minutes, `renewed: true` includes a replacement bearer token.

### 9. Call a protected endpoint with the token

```bash
curl -sS \
  http://localhost:8787/api/dashboard \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.generatedAt, .currentSprint.sprint, .jiraSummary'
```

A valid token should allow the request and return the normal Dashboard response.

To verify project scoping as well:

```bash
curl -sS \
  'http://localhost:8787/api/dashboard?projectId=<PROJECT_PAGE_ID>' \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.project, .currentSprint.sprint, .jiraSummary, .releaseSummary'
```

Replace `<PROJECT_PAGE_ID>` with a real Notion Project page ID.

### 10. Verify invalid tokens are rejected

```bash
curl -sS -i \
  http://localhost:8787/api/dashboard \
  -H 'Authorization: Bearer invalid-token'
```

Expected: HTTP 401.

### 11. Verify CORS preflight does not require authentication

```bash
curl -sS -i \
  -X OPTIONS \
  http://localhost:8787/api/dashboard \
  -H 'Origin: http://localhost:4200' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: Authorization,Content-Type'
```

Expected: a successful preflight response such as HTTP 204, not an authentication 401.

### 12. Optional: verify wrong-password handling

Enter an incorrect password:

```bash
read -s -p "Wrong password test: " AUTH_PASSWORD_INPUT
echo
```

Then call login:

```bash
curl -sS -i \
  -X POST \
  http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg password "$AUTH_PASSWORD_INPUT" '{password:$password}')"
```

Clear the variable:

```bash
unset AUTH_PASSWORD_INPUT
```

Expected: HTTP 401 with `Invalid credentials`.

### 13. Optional: verify login rate limiting

The login endpoint is rate limited. Repeated failed login attempts should eventually return HTTP 429. Run this only when intentionally testing the limiter because it can temporarily block further local login attempts.

### 14. Verify secrets are not tracked by Git

Confirm `.dev.vars` remains ignored:

```bash
git check-ignore -v .dev.vars
```

Search tracked files for credential assignments:

```bash
git grep -nE \
  'AUTH_PASSWORD_HASH=|AUTH_PASSWORD_SALT=|AUTH_JWT_SECRET=|NOTION_TOKEN=' \
  -- ':!.gitignore'
```

Documentation placeholders are acceptable. Real secret values must never appear in tracked files.

Confirm the old plaintext-password binding is gone:

```bash
git grep -n 'AUTH_PASSWORD='
```

Expected: no runtime/configuration occurrence of the old plaintext password binding.

### 15. Clean up shell variables

```bash
unset TOKEN
unset LOGIN_RESPONSE
unset AUTH_PASSWORD_INPUT
```

Never paste passwords, JWT access tokens, password hashes, salts, JWT signing secrets, or the Notion token into commits, issues, screenshots, shared logs, or documentation.

## Production Login Verification

Production Worker URL:

```text
https://work-tracker-api.techie-ar.workers.dev
```

List configured Worker secret names without printing values:

```bash
npx wrangler secret list
```

Expected secret names:

```text
NOTION_TOKEN
AUTH_PASSWORD_HASH
AUTH_PASSWORD_SALT
AUTH_JWT_SECRET
```

Tail production logs in a separate terminal:

```bash
npx wrangler tail
```

Safe production login check:

```bash
read -s -p "Login password: " AUTH_PASSWORD_INPUT
echo

LOGIN_RESPONSE=$(curl -sS -i \
  -X POST \
  https://work-tracker-api.techie-ar.workers.dev/api/auth/login \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg password "$AUTH_PASSWORD_INPUT" '{password:$password}')")

unset AUTH_PASSWORD_INPUT

printf '%s\n' "$LOGIN_RESPONSE" | awk 'BEGIN { body = 0 } /^$/ { body = 1; next } body == 0 { print }'
printf '%s\n' "$LOGIN_RESPONSE" | awk 'BEGIN { body = 0 } /^$/ { body = 1; next } body == 1 { print }' \
  | jq '{
      tokenType,
      expiresIn,
      accessTokenReceived: (.accessToken != null),
      error
    }'
```

This prints response headers and a redacted/summarized body. It does not print the successful JWT access token.

Useful production log codes for login diagnostics:

```text
AUTH_LOGIN_REQUEST_RECEIVED
AUTH_RATE_LIMIT_OK
AUTH_CONFIG_VALID
AUTH_PASSWORD_VERIFY_START
AUTH_PASSWORD_VERIFY_FAILED
AUTH_PASSWORD_VERIFY_SUCCESS
AUTH_TOKEN_SIGN_START
AUTH_TOKEN_SIGN_SUCCESS
AUTH_LOGIN_INTERNAL_ERROR:<safe-code>
```

Safe internal error codes include:

```text
AUTH_CONFIG_HASH_MISSING
AUTH_CONFIG_HASH_INVALID
AUTH_CONFIG_SALT_MISSING
AUTH_CONFIG_SALT_INVALID
AUTH_CONFIG_JWT_SECRET_MISSING
AUTH_CONFIG_SESSION_DB_MISSING
AUTH_CONFIG_ITERATIONS_INVALID
AUTH_CONFIG_TTL_INVALID
AUTH_RATE_LIMIT_ERROR
AUTH_PASSWORD_VERIFY_ERROR
AUTH_SESSION_STORE_ERROR
AUTH_TOKEN_SIGN_ERROR
AUTH_UNEXPECTED_ERROR
```

## Security Model

The Worker stores:

- `AUTH_PASSWORD_HASH`
- `AUTH_PASSWORD_SALT`
- `AUTH_JWT_SECRET`

The Worker does not store the original user password. The user-entered password exists only transiently during the HTTPS login request and Worker execution.

Login verification flow:

```text
password
  -> PBKDF2-SHA256 + stored salt
  -> stored verifier comparison
  -> short-lived JWT-compatible access token
```

The stored verifier uses a 256-bit PBKDF2-SHA256 output encoded as Base64URL. The salt is 32 random bytes encoded as Base64URL and is generated once when creating the verifier, not during each login attempt.

The Worker currently derives the verifier with 100000 PBKDF2-HMAC-SHA256 iterations to remain compatible with Cloudflare Workers native Web Crypto. Because the iteration count is part of the verifier calculation, regenerate `AUTH_PASSWORD_HASH` and `AUTH_PASSWORD_SALT` whenever that value changes.

`AUTH_JWT_SECRET` signs access tokens. Do not reuse the password, password hash, or Notion token as the JWT signing secret.
