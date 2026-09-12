# API Smoke Testing with `curl` in WSL2

This guide provides a practical local smoke-test checklist for the Work Tracker API using `curl` from WSL2.

It is intended for quick verification after API changes, Notion schema changes, authentication changes, Worker upgrades, or before committing/deploying a feature branch.

---

## 1. What is a smoke test?

A **smoke test** is a small set of high-value checks that verifies the main system paths are alive and working together.

A smoke test is not the same as a full automated test suite.

The automated test suite may prove that isolated code paths behave correctly with mocked or controlled data, while a local smoke test verifies the real integration:

```text
curl / WSL2
    ↓
Local Cloudflare Worker
    ↓
Authentication
    ↓
Worker routing / validation
    ↓
Real Notion API
    ↓
Real Notion databases/pages
```

Typical smoke-test questions are:

- Can the Worker start?
- Can I authenticate?
- Can protected endpoints be reached?
- Can metadata be read from the real Notion schema?
- Does `QUERY` work with real Notion data?
- Does cursor pagination work?
- Can I create a temporary record?
- Can I edit it?
- Can I change its status?
- Can I delete/trash it?
- Can bulk delete process multiple records in one Worker request?
- Can Markdown content be read and written?
- Can a `.md` file be imported into Reference Library?

A smoke test should be:

- small enough to run manually;
- destructive only to temporary test data;
- easy to repeat;
- safe to run before commit/deployment.

---

# 2. Before testing

Use two WSL2 terminals.

## Terminal A — run the Worker

From the repository root:

```bash
npm run dev
```

The examples in this document assume:

```text
http://localhost:8787
```

Keep this terminal running.

## Terminal B — run `curl`

Define the local API base URL:

```bash
export API_BASE="http://localhost:8787"
```

Check it:

```bash
echo "$API_BASE"
```

Expected:

```text
http://localhost:8787
```

---

# 3. Public health check

Before testing authentication, verify that the Worker itself is reachable:

```bash
curl -i "$API_BASE/"
```

Or:

```bash
curl -sS "$API_BASE/" | jq
```

Expected response should identify the Work Tracker API and report an OK status.

If this fails with:

```text
curl: (7) Failed to connect
```

the Worker is not running or is not listening on port `8787`.

Do not debug authentication until the root endpoint works.

---

# 4. Authenticate

Protected `/api/*` routes require a bearer token.

Clear stale shell values:

```bash
unset TOKEN
unset AUTH_PASSWORD
unset LOGIN_RESPONSE
```

Read the password silently:

```bash
read -s -p "Office Orbit password: " AUTH_PASSWORD
echo
```

Login:

```bash
LOGIN_RESPONSE=$(
  curl -sS -X POST \
    "$API_BASE/api/auth/login" \
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

Inspect the response without revealing the token:

```bash
echo "$LOGIN_RESPONSE" | jq '
  if .accessToken
  then .accessToken = "***REDACTED***"
  else .
  end
'
```

Export the token:

```bash
export TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken // empty')
```

Check only its length:

```bash
echo ${#TOKEN}
```

Do not run:

```bash
echo "$TOKEN"
```

---

# 5. Verify authentication

Always test authentication before blaming a feature endpoint:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/auth/status" | jq
```

Expected:

```json
{
  "authenticated": true
}
```

If this returns `401`, stop and authenticate again.

---

# 6. Reusable authenticated GET pattern

Most protected GET calls use:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/..." | jq
```

For status + headers:

```bash
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/..."
```

---

# 7. Authentication endpoints

## Status

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/auth/status" | jq
```

## Active sessions

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/auth/sessions" | jq
```

## Renew

```bash
RENEW_RESPONSE=$(
  curl -sS -X POST \
    "$API_BASE/api/auth/renew" \
    -H "Authorization: Bearer $TOKEN"
)
```

Inspect safely:

```bash
echo "$RENEW_RESPONSE" | jq '
  if .accessToken
  then .accessToken = "***REDACTED***"
  else .
  end
'
```

If a replacement token was returned:

```bash
NEW_TOKEN=$(echo "$RENEW_RESPONSE" | jq -r '.accessToken // empty')

if [ -n "$NEW_TOKEN" ]; then
  export TOKEN="$NEW_TOKEN"
fi

unset NEW_TOKEN
```

## Logout current session

Only run this when you intentionally want to end the current test session:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/auth/logout" | jq
```

You must log in again afterward.

---

# 8. Metadata smoke tests

Metadata endpoints are important because they prove that the Worker can read the **real current Notion schema**.

## To Do metadata

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/todos/meta" | jq
```

Check for:

```text
To Do
Status
Due Date
Assignee
Notes
Created
Last Edited
```

`Assignee` should be read-only for the current Office Orbit design.

## Tasks metadata

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/tasks/meta" | jq
```

Check for:

```text
Task
Status
Priority
Responsibility
Requested By
Requested By Type
Assigned To
Assigned To Type
Due Date
Follow-up Date
Completed Date
Company
JIRAs
Notes
Outcome / Update
Created
Last Edited
```

## Memos metadata

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/memos/meta" | jq
```

Check:

```text
Memo
Category
Tags
Pinned
Created
Last Edited
```

## Existing writable-resource metadata

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-logs/meta" | jq
```

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/feedback/meta" | jq
```

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-links/meta" | jq
```

---

# 9. Save live option IDs for write tests

Writes use Notion option IDs rather than trusting arbitrary option names.

## To Do status IDs

```bash
TODO_META=$(
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/api/todos/meta"
)
```

Extract:

```bash
export TODO_STATUS_NOT_STARTED=$(
  echo "$TODO_META" | jq -r '
    .fields[]
    | select(.key=="statusOptionId")
    | .options[]
    | select(.name=="Not started")
    | .id
  '
)
```

```bash
export TODO_STATUS_IN_PROGRESS=$(
  echo "$TODO_META" | jq -r '
    .fields[]
    | select(.key=="statusOptionId")
    | .options[]
    | select(.name=="In progress")
    | .id
  '
)
```

```bash
export TODO_STATUS_DONE=$(
  echo "$TODO_META" | jq -r '
    .fields[]
    | select(.key=="statusOptionId")
    | .options[]
    | select(.name=="Done")
    | .id
  '
)
```

Check only that values exist:

```bash
test -n "$TODO_STATUS_NOT_STARTED" && echo "Not started ID loaded"
test -n "$TODO_STATUS_IN_PROGRESS" && echo "In progress ID loaded"
test -n "$TODO_STATUS_DONE" && echo "Done ID loaded"
```

## Task metadata

```bash
TASK_META=$(
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/api/tasks/meta"
)
```

Example extraction:

```bash
export TASK_STATUS_NOT_STARTED=$(
  echo "$TASK_META" | jq -r '
    .fields[]
    | select(.key=="statusOptionId")
    | .options[]
    | select(.name=="Not started")
    | .id
  '
)
```

```bash
export TASK_STATUS_IN_PROGRESS=$(
  echo "$TASK_META" | jq -r '
    .fields[]
    | select(.key=="statusOptionId")
    | .options[]
    | select(.name=="In progress")
    | .id
  '
)
```

```bash
export TASK_STATUS_DONE=$(
  echo "$TASK_META" | jq -r '
    .fields[]
    | select(.key=="statusOptionId")
    | .options[]
    | select(.name=="Done")
    | .id
  '
)
```

Urgent:

```bash
export TASK_PRIORITY_URGENT=$(
  echo "$TASK_META" | jq -r '
    .fields[]
    | select(.key=="priorityOptionId")
    | .options[]
    | select(.name=="Urgent")
    | .id
  '
)
```

My Task:

```bash
export TASK_RESP_MY_TASK=$(
  echo "$TASK_META" | jq -r '
    .fields[]
    | select(.key=="responsibilityOptionId")
    | .options[]
    | select(.name=="My Task")
    | .id
  '
)
```

Delegated:

```bash
export TASK_RESP_DELEGATED=$(
  echo "$TASK_META" | jq -r '
    .fields[]
    | select(.key=="responsibilityOptionId")
    | .options[]
    | select(.name=="Delegated")
    | .id
  '
)
```

Waiting On:

```bash
export TASK_RESP_WAITING_ON=$(
  echo "$TASK_META" | jq -r '
    .fields[]
    | select(.key=="responsibilityOptionId")
    | .options[]
    | select(.name=="Waiting On")
    | .id
  '
)
```

---

# 10. HTTP `QUERY`

Work Tracker uses HTTP `QUERY` for safe, body-based filtered reads.

Basic pattern:

```bash
curl -sS -X QUERY \
  "$API_BASE/api/resource" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {},
    "pageSize": 25
  }' | jq
```

`QUERY` is:

- read-only;
- safe;
- idempotent;
- JSON-body based;
- suitable for filters too complex for a query string.

---

# 11. To Do smoke tests

## GET first page

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/todos?pageSize=25" | jq
```

## Open To Dos

```bash
curl -sS -X QUERY \
  "$API_BASE/api/todos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "statuses": ["Not started", "In progress"]
    },
    "pageSize": 25
  }' | jq
```

## Overdue To Dos

Set today's date:

```bash
TODAY=$(date +%F)
```

Then:

```bash
curl -sS -X QUERY \
  "$API_BASE/api/todos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg today "$TODAY" '{
    filters: {
      statuses: ["Not started", "In progress"],
      dueBefore: $today
    },
    pageSize: 25
  }')" | jq
```

## Create a temporary To Do

```bash
TODO_CREATE_RESPONSE=$(
  curl -sS -X POST \
    "$API_BASE/api/todos" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -nc \
      --arg status "$TODO_STATUS_NOT_STARTED" \
      '{
        toDo: "API smoke test - temporary",
        statusOptionId: $status,
        notes: "Created from WSL2 curl smoke test"
      }')"
)
```

Inspect:

```bash
echo "$TODO_CREATE_RESPONSE" | jq
```

Capture the created page ID:

```bash
export TEST_TODO_ID=$(echo "$TODO_CREATE_RESPONSE" | jq -r '.data.id // empty')
```

Check:

```bash
echo "$TEST_TODO_ID"
```

A Notion page ID is safe to display; it is not a secret.

## Change To Do status

```bash
curl -sS -X PATCH \
  "$API_BASE/api/todos/$TEST_TODO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc \
    --arg status "$TODO_STATUS_IN_PROGRESS" \
    '{statusOptionId: $status}')" | jq
```

Change to Done:

```bash
curl -sS -X PATCH \
  "$API_BASE/api/todos/$TEST_TODO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc \
    --arg status "$TODO_STATUS_DONE" \
    '{statusOptionId: $status}')" | jq
```

## Delete the temporary To Do

```bash
curl -sS -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/todos/$TEST_TODO_ID" | jq
```

---

# 12. Tasks & Follow-ups smoke tests

## GET

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/tasks?pageSize=25" | jq
```

## Active

```bash
curl -sS -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "statuses": ["Not started", "In progress"]
    },
    "pageSize": 25
  }' | jq
```

## Delegated

```bash
curl -sS -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "statuses": ["Not started", "In progress"],
      "responsibilities": ["Delegated"]
    },
    "pageSize": 25
  }' | jq
```

## Waiting On

```bash
curl -sS -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "statuses": ["Not started", "In progress"],
      "responsibilities": ["Waiting On"]
    },
    "pageSize": 25
  }' | jq
```

## Requested by Manager / Team Lead / Senior / Client

```bash
curl -sS -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "statuses": ["Not started", "In progress"],
      "requestedByTypes": ["Manager", "Team Lead", "Senior", "Client"]
    },
    "pageSize": 25
  }' | jq
```

## Follow-up due today or earlier

```bash
TODAY=$(date +%F)

curl -sS -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg today "$TODAY" '{
    filters: {
      statuses: ["Not started", "In progress"],
      followUpOnOrBefore: $today
    },
    pageSize: 25
  }')" | jq
```

## Overdue Tasks

```bash
TODAY=$(date +%F)

curl -sS -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg today "$TODAY" '{
    filters: {
      statuses: ["Not started", "In progress"],
      dueBefore: $today
    },
    pageSize: 25
  }')" | jq
```

## Create a temporary Task

```bash
TASK_CREATE_RESPONSE=$(
  curl -sS -X POST \
    "$API_BASE/api/tasks" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -nc \
      --arg status "$TASK_STATUS_NOT_STARTED" \
      --arg priority "$TASK_PRIORITY_URGENT" \
      --arg responsibility "$TASK_RESP_MY_TASK" \
      '{
        task: "API smoke test task - temporary",
        statusOptionId: $status,
        priorityOptionId: $priority,
        responsibilityOptionId: $responsibility,
        notes: "Temporary task created from WSL2"
      }')"
)
```

Inspect:

```bash
echo "$TASK_CREATE_RESPONSE" | jq
```

Capture ID:

```bash
export TEST_TASK_ID=$(echo "$TASK_CREATE_RESPONSE" | jq -r '.data.id // empty')
```

## Change Task status

```bash
curl -sS -X PATCH \
  "$API_BASE/api/tasks/$TEST_TASK_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc \
    --arg status "$TASK_STATUS_IN_PROGRESS" \
    '{statusOptionId: $status}')" | jq
```

## Mark Task Done

```bash
curl -sS -X PATCH \
  "$API_BASE/api/tasks/$TEST_TASK_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc \
    --arg status "$TASK_STATUS_DONE" \
    --arg completed "$(date +%F)" \
    '{
      statusOptionId: $status,
      completedDate: $completed
    }')" | jq
```

## Delete Task

```bash
curl -sS -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/tasks/$TEST_TASK_ID" | jq
```

---

# 13. Memos smoke tests

## GET

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/memos?pageSize=25" | jq
```

## Pinned Memos

```bash
curl -sS -X QUERY \
  "$API_BASE/api/memos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "pinned": true
    },
    "pageSize": 25
  }' | jq
```

## Query Commands

```bash
curl -sS -X QUERY \
  "$API_BASE/api/memos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "categories": ["Command"]
    },
    "pageSize": 25
  }' | jq
```

## Load Memo metadata and Category option ID

```bash
MEMO_META=$(
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/api/memos/meta"
)
```

```bash
export MEMO_CATEGORY_NOTE=$(
  echo "$MEMO_META" | jq -r '
    .fields[]
    | select(.key=="categoryOptionId")
    | .options[]
    | select(.name=="Note")
    | .id
  '
)
```

## Create Memo with Markdown

```bash
MEMO_CREATE_RESPONSE=$(
  curl -sS -X POST \
    "$API_BASE/api/memos" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -nc \
      --arg category "$MEMO_CATEGORY_NOTE" \
      '{
        memo: "API Markdown smoke test",
        categoryOptionId: $category,
        pinned: false,
        markdown: "# Smoke Test\n\nThis memo was created through the Work Tracker API.\n\n```bash\necho hello\n```\n\n- Item one\n- Item two"
      }')"
)
```

Inspect:

```bash
echo "$MEMO_CREATE_RESPONSE" | jq
```

Capture:

```bash
export TEST_MEMO_ID=$(echo "$MEMO_CREATE_RESPONSE" | jq -r '.data.id // empty')
```

## Read Memo detail + Markdown

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/memos/$TEST_MEMO_ID" | jq
```

## Update Memo Markdown

```bash
curl -sS -X PATCH \
  "$API_BASE/api/memos/$TEST_MEMO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "pinned": true,
    "markdown": "# Updated Smoke Test\n\nThe Markdown body was updated through the API.\n\n**Bold text**\n\n`inline code`"
  }' | jq
```

## Delete Memo

```bash
curl -sS -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/memos/$TEST_MEMO_ID" | jq
```

---

# 14. Bulk delete smoke test

Bulk delete lets the client remove multiple selected records using one Work Tracker API call.

Do this only with temporary test records.

Example request shape:

```bash
curl -sS -X POST \
  "$API_BASE/api/todos/bulk-delete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "pageIds": [
      "PAGE_ID_1",
      "PAGE_ID_2"
    ]
  }' | jq
```

Equivalent routes:

```text
POST /api/todos/bulk-delete
POST /api/tasks/bulk-delete
POST /api/memos/bulk-delete
```

Do not use production/important page IDs when manually testing bulk deletion.

---

# 15. Cursor pagination smoke test

Request a deliberately small page:

```bash
PAGE1=$(
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/api/tasks?pageSize=1"
)
```

Inspect:

```bash
echo "$PAGE1" | jq
```

Extract:

```bash
NEXT_CURSOR=$(echo "$PAGE1" | jq -r '.nextCursor // empty')
```

Check:

```bash
echo "$NEXT_CURSOR"
```

If `hasMore` is `true`, request the next page:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  --get \
  --data-urlencode "pageSize=1" \
  --data-urlencode "cursor=$NEXT_CURSOR" \
  "$API_BASE/api/tasks" | jq
```

Treat cursors as opaque.

Never decode or alter them.

---

# 16. QUERY cursor pagination

First page:

```bash
QUERY_PAGE1=$(
  curl -sS -X QUERY \
    "$API_BASE/api/tasks" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data '{
      "filters": {
        "statuses": ["Not started", "In progress"]
      },
      "pageSize": 1
    }'
)
```

Inspect:

```bash
echo "$QUERY_PAGE1" | jq
```

Extract:

```bash
QUERY_CURSOR=$(echo "$QUERY_PAGE1" | jq -r '.nextCursor // empty')
```

Next page:

```bash
curl -sS -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc \
    --arg cursor "$QUERY_CURSOR" \
    '{
      filters: {
        statuses: ["Not started", "In progress"]
      },
      pageSize: 1,
      cursor: $cursor
    }')" | jq
```

Do not reuse a cursor after changing:

- filters;
- page size;
- resource;
- query context.

---

# 17. Reference Library smoke tests

Reference Library is a normal Notion parent page, not a data source.

## List direct child pages

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/reference-library?pageSize=25" | jq
```

The collection response should contain metadata only.

It should not download every child's full Markdown body.

## Save the first Reference page ID

```bash
REFERENCE_PAGE_ID=$(
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/api/reference-library?pageSize=25" \
  | jq -r '.data[0].id // empty'
)
```

Check:

```bash
echo "$REFERENCE_PAGE_ID"
```

## Read one Reference page as Markdown

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/reference-library/$REFERENCE_PAGE_ID" | jq
```

Verify:

- title;
- Markdown body;
- created/edited timestamps;
- truncation information if provided;
- text fallback if provided.

---

# 18. Import a `.md` file into Reference Library

Create a temporary Markdown file:

```bash
cat > /tmp/reference-api-smoke-test.md <<'EOF'
# Reference Library Smoke Test

This page was imported through the Work Tracker API.

## Commands

```bash
echo "Hello from WSL2"
```

## Checklist

- API authentication works
- Multipart upload works
- Markdown import works
- New Notion child page is created

**Important:** delete this test page from Notion after verification if no longer needed.
EOF
```

Check size:

```bash
wc -c /tmp/reference-api-smoke-test.md
```

Upload:

```bash
curl -i -X POST \
  "$API_BASE/api/reference-library/import" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/reference-api-smoke-test.md;type=text/markdown"
```

Possible outcomes:

```text
201
```

The page was created synchronously.

Or:

```text
202
```

Notion accepted an asynchronous Markdown write.

If `202` is returned, inspect the response for the task/poll identifier and use the polling endpoint documented by the current implementation.

After success, verify the new page appears below the Notion `Reference Library` parent page.

---

# 19. Reference Library file-size boundary

The application maximum is:

```text
4,500,000 bytes
```

The Worker must reject larger imports.

A quick oversized test file can be generated without keeping it:

```bash
python - <<'PY'
from pathlib import Path
Path("/tmp/too-large-reference.md").write_bytes(b"a" * 4_500_001)
PY
```

Then:

```bash
curl -i -X POST \
  "$API_BASE/api/reference-library/import" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/too-large-reference.md;type=text/markdown"
```

Expected:

```text
413 Payload Too Large
```

Clean up:

```bash
rm -f /tmp/too-large-reference.md
```

---

# 20. Core existing read APIs

These are useful regression smoke tests after broad Worker changes.

## JIRAs

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/jiras?pageSize=25" | jq
```

Active:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/jiras/active?pageSize=25" | jq
```

Blocked:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/jiras/blocked?pageSize=25" | jq
```

Spillovers:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/jiras/spillovers?pageSize=25" | jq
```

Appraisal:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/jiras/appraisal?pageSize=25" | jq
```

Demo pending:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/jiras/demo-pending?pageSize=25" | jq
```

Demoed:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/jiras/demoed?pageSize=25" | jq
```

JIRA QUERY:

```bash
curl -sS -X QUERY \
  "$API_BASE/api/jiras" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {},
    "pageSize": 25
  }' | jq
```

---

# 21. Sprint APIs

All:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/sprints?pageSize=25" | jq
```

Active:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/sprints/active?pageSize=25" | jq
```

History:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/sprints/history?pageSize=25" | jq
```

Sprint allocations:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/sprint-allocations?pageSize=25" | jq
```

Current allocations:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/sprint-allocations/current?pageSize=25" | jq
```

For Sprint detail, first obtain a real Sprint page ID from a Sprint list response, then:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/sprints/SPRINT_PAGE_ID" | jq
```

---

# 22. Company / Team / Project APIs

Companies:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/companies?pageSize=25" | jq
```

Active Companies:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/companies/active?pageSize=25" | jq
```

Teams:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/teams?pageSize=25" | jq
```

Active Teams:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/teams/active?pageSize=25" | jq
```

Projects:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/projects?pageSize=25" | jq
```

Active Projects:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/projects/active?pageSize=25" | jq
```

---

# 23. Dashboard

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/dashboard" | jq
```

The Dashboard is an aggregate endpoint and does not follow normal collection pagination.

---

# 24. Work Logs

GET:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-logs?pageSize=25" | jq
```

Appraisal:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-logs/appraisal?pageSize=25" | jq
```

QUERY:

```bash
curl -sS -X QUERY \
  "$API_BASE/api/work-logs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {},
    "pageSize": 25
  }' | jq
```

For create/update smoke tests, first inspect:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-logs/meta" | jq
```

Use only option IDs returned by metadata.

---

# 25. Feedback

All:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/feedback?pageSize=25" | jq
```

Appraisal:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/feedback/appraisal?pageSize=25" | jq
```

Improvement / Follow-up:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/feedback/improvement-follow-up?pageSize=25" | jq
```

Negative:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/feedback/negative?pageSize=25" | jq
```

QUERY:

```bash
curl -sS -X QUERY \
  "$API_BASE/api/feedback" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {},
    "pageSize": 25
  }' | jq
```

Metadata:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/feedback/meta" | jq
```

---

# 26. Work Links

All:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-links?pageSize=25" | jq
```

Active:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-links/active?pageSize=25" | jq
```

QUERY:

```bash
curl -sS -X QUERY \
  "$API_BASE/api/work-links" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {},
    "pageSize": 25
  }' | jq
```

Metadata:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/work-links/meta" | jq
```

---

# 27. Releases

All:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/releases?pageSize=25" | jq
```

Pending:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/releases/pending?pageSize=25" | jq
```

Confirmed:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/releases/confirmed?pageSize=25" | jq
```

Not announced:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/releases/not-announced?pageSize=25" | jq
```

---

# 28. Check `QUERY` capability headers

A QUERY-capable collection should advertise:

```text
Accept-Query: application/json
```

Example:

```bash
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/tasks?pageSize=1"
```

For CORS/OPTIONS inspection:

```bash
curl -i -X OPTIONS \
  "$API_BASE/api/tasks"
```

The appropriate collection route should allow the supported methods, including `QUERY`.

---

# 29. Useful HTTP status checks

Use `-i` when you need headers and status:

```bash
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/tasks?pageSize=1"
```

Or capture only the status:

```bash
curl -sS -o /tmp/api-response.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/tasks?pageSize=1"
```

Inspect body:

```bash
jq . /tmp/api-response.json
```

---

# 30. Intentional negative smoke tests

A good smoke test includes a few expected failures.

## Missing bearer token

```bash
curl -i "$API_BASE/api/tasks"
```

Expected:

```text
401
```

## Invalid Notion page ID

```bash
curl -i -X PATCH \
  "$API_BASE/api/tasks/not-a-notion-id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{}'
```

Expected:

```text
400
```

## Unknown QUERY filter

```bash
curl -i -X QUERY \
  "$API_BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "thisFilterDoesNotExist": true
    }
  }'
```

Expected:

```text
400
```

## Invalid page size

```bash
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/api/tasks?pageSize=1000"
```

Expected:

```text
400
```

---

# 31. Fast non-destructive smoke-test checklist

When you only want a quick sanity check, run:

```text
[ ] GET /
[ ] POST /api/auth/login
[ ] GET /api/auth/status
[ ] GET /api/todos/meta
[ ] QUERY /api/todos
[ ] GET /api/tasks/meta
[ ] QUERY /api/tasks
[ ] GET /api/memos/meta
[ ] QUERY /api/memos
[ ] GET /api/reference-library
[ ] GET one Reference Library Markdown page
[ ] GET /api/jiras
[ ] GET /api/sprints/active
[ ] GET /api/dashboard
[ ] GET /api/work-logs
[ ] GET /api/feedback
[ ] GET /api/work-links
[ ] GET /api/releases
```

This does not intentionally mutate Notion.

---

# 32. Full write smoke-test checklist

Before commit/deployment of a write-heavy feature:

```text
[ ] Authentication works
[ ] To Do metadata matches Notion
[ ] Task metadata matches Notion
[ ] Memo metadata matches Notion

[ ] Create temporary To Do
[ ] Edit temporary To Do
[ ] Change To Do status
[ ] Delete temporary To Do

[ ] Create temporary Task
[ ] Edit temporary Task
[ ] Change Task status
[ ] Set Completed Date
[ ] Delete temporary Task

[ ] Create temporary Memo with Markdown
[ ] Read Memo Markdown
[ ] Edit Memo Markdown
[ ] Delete temporary Memo

[ ] Create 2 temporary records
[ ] Bulk delete both with one Worker request

[ ] List Reference Library
[ ] Read Reference Markdown
[ ] Import .md
[ ] Verify imported page in Notion
[ ] Verify >4.5 MB import is rejected

[ ] Cursor pagination works
[ ] QUERY cursor pagination works

[ ] Existing JIRA API still works
[ ] Existing Sprint API still works
[ ] Dashboard still works
[ ] Work Logs still work
[ ] Feedback still works
[ ] Work Links still work
[ ] Releases still work
```

---

# 33. After smoke testing

Run automated validation again:

```bash
npm test -- --run
```

```bash
npx tsc --noEmit
```

```bash
node node_modules/typescript/bin/tsc -p test/tsconfig.json
```

If Wrangler configuration changed:

```bash
npm run cf-typegen
```

Finally:

```bash
git diff --check
```

```bash
git status
```

```bash
git diff --stat
```

Do not commit until both:

```text
automated tests
+
live smoke tests
```

are satisfactory.

---

# 34. Cleanup

Remove temporary files:

```bash
rm -f /tmp/reference-api-smoke-test.md
rm -f /tmp/api-response.json
```

Clear shell credentials when finished:

```bash
unset TOKEN
unset LOGIN_RESPONSE
unset RENEW_RESPONSE
unset TODO_META
unset TASK_META
unset MEMO_META
```

Also clear temporary IDs if used:

```bash
unset TEST_TODO_ID
unset TEST_TASK_ID
unset TEST_MEMO_ID
unset REFERENCE_PAGE_ID
```

---

# 35. Troubleshooting order

When a test fails, diagnose in this order:

```text
1. Is npm run dev still running?
2. Does GET / return 200?
3. Does TOKEN exist?
4. Does GET /api/auth/status return authenticated=true?
5. Is the endpoint/path correct?
6. Is Content-Type application/json where required?
7. Is the JSON valid?
8. Does /meta show the expected Notion schema?
9. Are option IDs from current /meta?
10. Are relation IDs valid Notion page IDs?
11. Does the referenced Notion page belong to the correct resource?
12. Is cursor from the same query context?
13. Did Notion return an upstream/rate-limit error?
14. Check Worker terminal logs.
```

This order helps distinguish:

```text
Worker not running
vs.
authentication failure
vs.
request validation failure
vs.
Notion schema mismatch
vs.
upstream Notion failure
```

---

# Related documentation

- `documentation/05-local-development.md`
- `documentation/07-security.md`
- `documentation/08-http-query-method.md`
- `documentation/09-productivity-and-reference-api.md`
- `documentation/10-local-api-authentication-testing.md`
- `knowledge-base/authentication.md`
- `knowledge-base/http-query-method.md`
- `knowledge-base/todo-api.md`
- `knowledge-base/task-api.md`
- `knowledge-base/memo-api.md`
- `knowledge-base/reference-library-api.md`
