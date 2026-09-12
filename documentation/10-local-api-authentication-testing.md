# Local API Authentication Testing

This guide explains how to authenticate against the local Work Tracker API before manually testing protected endpoints with `curl`.

## Purpose

Almost every `/api/*` route is protected by the Work Tracker API bearer-token authentication layer.

Before testing endpoints such as:

```text
/api/todos
/api/tasks
/api/memos
/api/reference-library
/api/work-logs
/api/feedback
/api/work-links
```

first obtain a valid access token from:

```http
POST /api/auth/login
```

Do not hard-code the password or access token into shell history, source files, documentation, or `.dev.vars`.

## Prerequisites

Start the Worker locally:

```bash
npm run dev
```

The examples below assume the local Worker is available at:

```text
http://localhost:8787
```

You also need `curl`, `jq`, and the Office Orbit / Work Tracker API password configured for the local Worker.

## 1. Clear any old shell credentials

```bash
unset TOKEN
unset AUTH_PASSWORD
```

Check whether the current shell already has a token:

```bash
echo ${#TOKEN}
```

A value of `0` means no token is currently set. Do not print the token itself.

## 2. Read the password without exposing it

```bash
read -s -p "Office Orbit password: " AUTH_PASSWORD
echo
```

## 3. Login and create a local API session

```bash
LOGIN_RESPONSE=$(
  curl -sS -X POST \
    http://localhost:8787/api/auth/login \
    -H "Content-Type: application/json" \
    --data "$(jq -nc \
      --arg password "$AUTH_PASSWORD" \
      '{
        password: $password,
        device: {
          deviceId: "local-api-test",
          name: "WSL curl",
          platform: "desktop",
          model: "WSL2",
          appVersion: "dev"
        }
      }')"
)

unset AUTH_PASSWORD
```

The password is removed from the shell variable immediately after the login request.

## 4. Inspect the login response safely

Never print the real access token into screenshots, terminal logs, issues, or chats.

```bash
echo "$LOGIN_RESPONSE" | jq '
  if .accessToken
  then .accessToken = "***REDACTED***"
  else .
  end
'
```

A successful response should contain fields similar to:

```json
{
  "accessToken": "***REDACTED***",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": "2026-09-13T02:00:00.000Z",
  "renewAfter": "2026-09-13T01:45:00.000Z",
  "sessionStartedAt": "2026-09-13T01:00:00.000Z",
  "sessionExpiresAt": "2026-09-13T09:00:00.000Z"
}
```

If `.accessToken` is missing, do not continue with protected endpoint testing. Inspect the returned error first.

## 5. Export the bearer token

```bash
export TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken // empty')
```

Check only its length:

```bash
echo ${#TOKEN}
```

Do not use `echo "$TOKEN"` because that exposes the bearer token.

## 6. Verify authentication first

Before testing any feature endpoint, verify the token:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/auth/status | jq
```

Expected result:

```json
{
  "authenticated": true
}
```

The actual response can contain additional session fields.

If this returns `401 Unauthorized`, stop and authenticate again before testing other APIs.

## 7. Test protected API endpoints

Once `/api/auth/status` succeeds, the same `$TOKEN` can be used for all protected APIs.

### To Do metadata

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/todos/meta | jq
```

### Task metadata

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/tasks/meta | jq
```

### Memo metadata

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/memos/meta | jq
```

### Reference Library

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8787/api/reference-library?pageSize=25" | jq
```

## 8. Testing HTTP QUERY

The Work Tracker API uses HTTP `QUERY` for filtered read operations.

```bash
curl -sS -X QUERY \
  http://localhost:8787/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "statuses": ["Not started", "In progress"]
    },
    "pageSize": 25
  }' | jq
```

The bearer token is handled exactly like `GET`, `POST`, `PATCH`, and `DELETE`.

## 9. Access-token lifetime

Current Work Tracker authentication configuration uses:

```text
Access token lifetime:       1 hour
Renewal window:              final 15 minutes
Maximum session lifetime:    8 hours
```

A token may therefore become invalid while manually testing APIs.

A `401` after a previously successful test does not automatically mean the feature endpoint is broken. Verify `/api/auth/status` first.

## 10. Renew an active session

When the token enters its renewal window:

```bash
RENEW_RESPONSE=$(
  curl -sS -X POST \
    http://localhost:8787/api/auth/renew \
    -H "Authorization: Bearer $TOKEN"
)
```

Inspect it safely:

```bash
echo "$RENEW_RESPONSE" | jq '
  if .accessToken
  then .accessToken = "***REDACTED***"
  else .
  end
'
```

If a replacement token is returned:

```bash
export TOKEN=$(echo "$RENEW_RESPONSE" | jq -r '.accessToken // empty')
```

Then verify it:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/auth/status | jq
```

If renewal says reauthentication is required, perform a fresh password login.

## 11. Common `401 Unauthorized` troubleshooting

### Check whether `TOKEN` exists

```bash
echo ${#TOKEN}
```

If it is empty or unexpectedly short, login again.

### Check authentication independently

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/auth/status | jq
```

If this also returns `401`, the problem is authentication/session state, not the feature endpoint.

### Check Authorization syntax

Correct:

```text
Authorization: Bearer <token>
```

Incorrect examples:

```text
Authorization: <token>
Bearer: <token>
Authorization: Bearer
```

### Check for an expired session

The bearer token can expire after one hour, and the backing session has an absolute maximum lifetime. Authenticate again if necessary.

### Check local Worker configuration

Make sure `wrangler dev` is running with the expected local secrets and bindings.

Do not paste secrets into commands simply to work around configuration problems.

## 12. Recommended local testing workflow

```text
1. npm run dev
2. unset old TOKEN
3. read password silently
4. POST /api/auth/login
5. redact response before displaying it
6. export TOKEN
7. GET /api/auth/status
8. test feature endpoints
9. renew/login again when required
```

This separates authentication failures from feature/API failures and makes manual testing easier to diagnose.

## Security notes

- Never commit `NOTION_TOKEN`.
- Never commit the Office Orbit password.
- Never commit `AUTH_JWT_SECRET`.
- Never paste a live bearer token into source code.
- Never include a live bearer token in documentation.
- Avoid printing `$TOKEN`.
- Redact `accessToken` before sharing terminal output.
- Keep `.dev.vars` out of version control.
- The Angular/Capacitor client must never receive the Notion token.
- Only the Work Tracker API bearer token belongs in client API requests.

## Related documentation

- `documentation/05-local-development.md`
- `documentation/07-security.md`
- `documentation/08-http-query-method.md`
- `documentation/09-productivity-and-reference-api.md`
- `knowledge-base/authentication.md`
- `knowledge-base/http-query-method.md`
