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
  "password": "your_work_tracker_password_here"
}
```

Successful response:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 3600
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

## Token Status

```http
GET /api/auth/status
Authorization: Bearer <accessToken>
```

```json
{
  "authenticated": true,
  "subject": "owner",
  "expiresAt": "2026-09-03T12:00:00.000Z"
}
```

Missing, malformed, expired, or invalid tokens return the same generic HTTP 401 response:

```json
{
  "error": "Unauthorized"
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

`AUTH_JWT_SECRET` must be independent of password verification. `AUTH_TOKEN_TTL_SECONDS` is non-secret Wrangler configuration and defaults to 3600 seconds when absent. Accepted TTL values are 300 through 86400 seconds.

`AUTH_PASSWORD_ITERATIONS` is non-secret Wrangler configuration. It defaults to 600000 and may be tuned between 100000 and 2000000 after benchmarking in the actual Cloudflare Worker environment.

Production secrets should be configured with Wrangler secrets:

```bash
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put AUTH_PASSWORD_HASH
npx wrangler secret put AUTH_PASSWORD_SALT
npx wrangler secret put AUTH_JWT_SECRET
```

Login requests are rate limited by the `AUTH_RATE_LIMITER` Cloudflare Rate Limit binding.

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

`AUTH_JWT_SECRET` signs access tokens. Do not reuse the password, password hash, or Notion token as the JWT signing secret.
