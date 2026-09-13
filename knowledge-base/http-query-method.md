# HTTP QUERY Method

The Work Tracker API uses HTTP `QUERY` for safe JSON-body read requests where query strings would become awkward or ambiguous.

## Supported Resources

```text
QUERY /api/jiras
QUERY /api/jiras/options
QUERY /api/work-logs
QUERY /api/feedback
QUERY /api/work-links
QUERY /api/todos
QUERY /api/tasks
QUERY /api/memos
```

These endpoints are authenticated like other protected `/api/*` routes and are read-only. They do not create, update, delete, cache, or mutate Notion data.

Reference Library supports `QUERY` on `/api/reference-library` with `categories`, `tags`, and `q` filters. Its metadata, detail, import, and import-status routes do not advertise QUERY.

## Headers

Clients must send:

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

QUERY-capable resources advertise:

```http
Accept-Query: application/json
```

CORS preflight responses include `QUERY` in `Access-Control-Allow-Methods`.

## Request Body

The common request shape is:

```json
{
  "filters": {},
  "pageSize": 25,
  "cursor": "opaque-cursor",
  "includeRelations": false
}
```

`filters` is optional and defaults to `{}`. `pageSize` is optional, defaults to `25`, and must be an integer from `1` to `100`. `cursor` is optional and opaque. `includeRelations` is optional and must be boolean.

Unknown top-level fields, unknown filter names, malformed dates, malformed Notion page IDs, and invalid body shapes return HTTP 400 before Notion is called.

## Filter Semantics

Clients send domain filters only. They do not send raw Notion filter JSON.

The Worker translates supported filters into Notion data-source filters:

- multiple values for one field are composed with Notion `or`
- different fields are composed with Notion `and`
- relation IDs are normalized Notion page IDs before use
- all filtering is performed by Notion, not by fetching all rows and filtering in JavaScript

`QUERY /api/jiras/options` is intentionally narrower than generic JIRA QUERY. It allows only `q`, defaults to active-sprint JIRAs when `q` is missing or blank, and searches all JIRAs when `q` has text.

## Related Docs

- [JIRA API](jira-api.md)
- [JIRA Picker API](jira-picker-api.md)
- [Work Log API](work-log-api.md)
- [Feedback API](feedback-api.md)
- [Work Links API](work-links-api.md)
- [To Do API](todo-api.md)
- [Task API](task-api.md)
- [Memo API](memo-api.md)
- [Notion Integration](notion-integration.md)
