# HTTP QUERY Method

The Work Tracker API uses HTTP `QUERY` for safe JSON-body read requests where query strings would become awkward or ambiguous.

## Supported Resources

```text
QUERY /api/jiras
QUERY /api/work-logs
QUERY /api/feedback
QUERY /api/work-links
```

These endpoints are authenticated like other protected `/api/*` routes and are read-only. They do not create, update, delete, cache, or mutate Notion data.

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

## Related Docs

- [JIRA API](jira-api.md)
- [Work Log API](work-log-api.md)
- [Feedback API](feedback-api.md)
- [Work Links API](work-links-api.md)
- [Notion Integration](notion-integration.md)
