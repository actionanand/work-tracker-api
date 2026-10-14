# Credential Vault API

## Security Model

This is an encrypted-storage API for the existing single authenticated owner (`owner`). Every endpoint uses the existing global bearer-token/session authentication. The Vault passphrase is separate from the application login password; there is no additional Worker login, Worker encryption secret, or server-side encryption/decryption.

The client derives an AES-GCM key locally from its Vault passphrase and the persistent PBKDF2 metadata, then encrypts the entire credential payload locally. Names, credential types, usernames, passwords, API tokens, URLs, hosts/ports, environments, notes and tags must all remain inside that encrypted payload. Never put them in API paths, query strings, or additional JSON fields. Search/filtering happens locally after decryption; the complete encrypted list is returned without server-side text search or pagination in v1.

The Worker validates only the envelope, not whether ciphertext decrypts or whether a passphrase is correct. The client must implement authenticated AES-GCM encryption/decryption correctly, generate a fresh random 12-byte IV for every encryption under a key (including edits), and verify the encrypted key-check value locally. Do not reuse the key-check IV for a credential. The Worker does not know the key-check plaintext. Envelope validation cannot detect a defective or malicious client putting plaintext into an encoded string.

This protects credential contents against database-only disclosure, subject to passphrase strength and the client's KDF settings. It does not protect an unlocked client, compromised client code/device, an attacker who obtains the passphrase, or availability/integrity against an attacker with API authorization. An API token permits fetching, changing and deleting encrypted records, but is not the encryption key. The server can see record IDs, sizes, timestamps, revisions and cryptographic parameters. This design is single-owner, not a multi-tenant isolation scheme.

**A forgotten Vault passphrase cannot be recovered by the Worker.** There is no reset-vault, metadata-edit, passphrase-change or re-key API in v1. Back up the passphrase securely. Deleting or replacing metadata out of band can make credentials unrecoverable.

All Vault responses, including validation, authorization, conflict, missing-record, server-error and OPTIONS responses, use `Cache-Control: no-store` and `Pragma: no-cache`. The implementation logs only a fixed generic failure marker, never request bodies, ciphertext, IVs, salts, key-check values, Authorization or SQL errors. Clients must also avoid logging plaintext or secrets.

## Storage and Migration

Uses the existing `AUTH_DB` D1 binding. No new database, paid service or secret is required.

- `credential_vault_meta`: one row (`id = 1`) with crypto version, KDF/iterations, salt, encrypted key-check/IV, and server timestamps.
- `credentials`: UUID, crypto version, IV, ciphertext, revision, and server timestamps. An `(updated_at DESC, id ASC)` index supports deterministic listing.

There are no plaintext credential columns or searchable credential metadata. SQL uses prepared, bound values. Timestamps are stored as integer milliseconds and returned as UTC ISO strings.

Migration: `migrations/0004_credential_vault.sql`. Before using these APIs, an operator must apply the checked-in migrations to the appropriate environment:

```bash
npx wrangler d1 migrations apply work-tracker-auth --local
# Production operation: run separately only after approval/review.
npx wrangler d1 migrations apply work-tracker-auth --remote
```

These commands are instructions for later operation, not automatic application startup behavior. Tests use only an isolated Vitest D1 database. An unapplied migration results in a safe HTTP 500, not a false uninitialized result.

## Envelope Validation

All request bodies are JSON objects; unknown/read-only fields are rejected with HTTP 400. Request bodies are bounded to 100 KiB, including JSON overhead; larger bodies return 413. Non-JSON media returns 415. Only the documented fields are accepted.

| Field | Accepted Value |
| --- | --- |
| `cryptoVersion` | Integer `1` |
| `kdf` | `PBKDF2-SHA-256` |
| `kdfIterations` | Integer 100,000 through 2,000,000; supplied by the client, not executed by the Worker |
| `salt` | Canonical unpadded base64url encoding of 16..64 bytes |
| `keyCheckIv`, `iv` | Canonical unpadded base64url encoding of exactly 12 bytes |
| `keyCheckCiphertext` | Canonical unpadded base64url encoding of 16..1,024 bytes, including the authentication tag |
| `ciphertext` | Canonical unpadded base64url encoding of 16..65,536 bytes, including the authentication tag |
| `expectedRevision` | Positive safe integer below `Number.MAX_SAFE_INTEGER`; required for PATCH |

Values are preserved exactly, not trimmed or rewritten. Encoding lengths are validated without inspecting decrypted content. The iteration range is an accepted transport bound, not a recommendation to use its minimum. The client must select its work factor and retain it in Vault metadata. This example's 310000 iterations illustrates the contract rather than performing key derivation on the server.

Credential IDs use a dedicated UUID parser, not the Notion page-ID parser: standard hyphenated hexadecimal UUIDs are accepted, surrounding whitespace is trimmed, and letters are normalized to lowercase. Compact Notion-style IDs are not accepted.

## Vault Metadata

`GET /api/credentials/vault` before initialization returns HTTP 200:

```json
{ "initialized": false }
```

Initialize using `POST /api/credentials/vault`:

```json
{
  "cryptoVersion": 1,
  "kdf": "PBKDF2-SHA-256",
  "kdfIterations": 310000,
  "salt": "<base64url>",
  "keyCheckIv": "<base64url>",
  "keyCheckCiphertext": "<base64url>"
}
```

HTTP 201 returns those exact metadata values with `initialized: true`, `createdAt`, and `updatedAt`. Subsequent GETs return the same object. The placeholders above must be replaced with valid client-generated encoded bytes.

Initialization is a conditional insert into the single-row table. Repeated or competing initialization cannot overwrite metadata: a second initialization returns HTTP 409:

```json
{ "error": "Credential Vault is already initialized", "code": "CREDENTIAL_VAULT_ALREADY_INITIALIZED" }
```

## Credential CRUD

`POST /api/credentials` accepts only:

```json
{ "cryptoVersion": 1, "iv": "<base64url>", "ciphertext": "<base64url>" }
```

The Vault must already be initialized; otherwise HTTP 409 `CREDENTIAL_VAULT_NOT_INITIALIZED`. Success returns HTTP 201:

```json
{
  "data": {
    "id": "<Worker-generated UUID>",
    "cryptoVersion": 1,
    "iv": "<base64url>",
    "ciphertext": "<base64url>",
    "revision": 1,
    "createdAt": "2026-10-14T12:00:00.000Z",
    "updatedAt": "2026-10-14T12:00:00.000Z"
  }
}
```

`GET /api/credentials` returns `{ "data": [<encrypted records>], "count": 1 }`, ordered by `updated_at DESC`, then `id ASC`. An empty list, including before initialization, returns `{ "data": [], "count": 0 }`.

`GET /api/credentials/:credentialId` returns `{ "data": <encrypted record> }`. Unknown IDs return HTTP 404:

```json
{ "error": "Credential not found", "code": "CREDENTIAL_NOT_FOUND" }
```

`PATCH /api/credentials/:credentialId` replaces the complete envelope:

```json
{ "cryptoVersion": 1, "iv": "<fresh base64url IV>", "ciphertext": "<new base64url ciphertext>", "expectedRevision": 3 }
```

The SQL update atomically matches `id` and `revision`, increments the revision, and returns the updated encrypted record in `{ "data": ... }`. An unknown ID returns 404; an existing ID with a different revision returns HTTP 409 without overwriting it:

```json
{ "error": "Credential changed on another device", "code": "CREDENTIAL_VERSION_CONFLICT" }
```

The client must reload and resolve a conflict. A PATCH response lost after a successful write will also cause an identical retry with the old revision to conflict; do not silently retry as a new edit. POST creation has no idempotency-key contract: a lost response must be reconciled by the client before creating again.

`DELETE /api/credentials/:credentialId` hard-deletes the live D1 row and returns an empty HTTP 204. An unknown ID returns 404 `CREDENTIAL_NOT_FOUND`. Hard-delete is not a guarantee that all backups or platform retention copies have been erased. Vault metadata is never deleted by credential deletion.

## Bulk Delete

`POST /api/credentials/bulk-delete`:

```json
{ "credentialIds": ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] }
```

Accepts 1..25 UUID strings. Duplicate normalized IDs, malformed IDs, empty/oversized batches and unknown fields return 400 before deletion starts.

Deletion uses one D1 batch of bound DELETE statements. [D1 batches execute sequentially in a transaction and roll back if a statement fails](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). A missing ID deletes zero rows and is not a SQL error: existing IDs are deleted and missing IDs are reported. HTTP 200 example:

```json
{
  "requested": 2,
  "deleted": 1,
  "failed": [{ "id": "22222222-2222-4222-8222-222222222222", "deleted": false, "error": "Credential not found", "code": "CREDENTIAL_NOT_FOUND" }],
  "allSucceeded": false
}
```

With no missing IDs, `failed` is empty and `allSucceeded` is true. An actual SQL/batch failure returns safe HTTP 500 `CREDENTIAL_VAULT_INTERNAL_ERROR` and the transaction rolls back; it does not report invented per-ID successes. A network failure can leave the caller unsure whether the transaction committed: GET/list can reconcile it. Repeated hard deletes report already-missing IDs rather than deleting anything else.

## Methods and Errors

| Resource | Allow |
| --- | --- |
| `/api/credentials` | `GET, POST, OPTIONS` |
| `/api/credentials/vault` | `GET, POST, OPTIONS` |
| `/api/credentials/bulk-delete` | `POST, OPTIONS` |
| `/api/credentials/:credentialId` | `GET, PATCH, DELETE, OPTIONS` |

Static routes take precedence over item IDs. OPTIONS remains an unauthenticated global preflight. Unsupported methods return 405; credential resources do not support QUERY and never advertise `Accept-Query`. The existing global CORS method policy remains unchanged for other APIs.

Validation errors contain static field names/messages, not submitted values. Unexpected database failures return only `{ "error": "Credential Vault unavailable", "code": "CREDENTIAL_VAULT_INTERNAL_ERROR" }` with HTTP 500, never SQL or envelope values.
