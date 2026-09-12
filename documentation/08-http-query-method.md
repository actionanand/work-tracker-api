# 08 — HTTP QUERY Method

## 1. Overview

Office Orbit's Work Tracker API supports the HTTP `QUERY` method for complex, read-only searches.

`QUERY` is a standardized HTTP method defined by RFC 10008.

It fills an important gap between `GET` and `POST`:

- like `GET`, a `QUERY` request is safe and idempotent;
- like `POST`, a `QUERY` request can carry structured request content;
- unlike `POST`, the method explicitly communicates that no server state is supposed to be changed.

In the Work Tracker API, `QUERY` is used when a read operation requires richer filters than are convenient to represent in a URL.

The API currently supports:

```text
QUERY /api/jiras
QUERY /api/work-logs
QUERY /api/feedback
QUERY /api/work-links
```

Simple retrieval continues to use `GET`.

Creating data continues to use `POST`.

Partially modifying data continues to use `PATCH`.

`QUERY` is additive. It does not replace the existing REST API.

---

## 2. Why HTTP QUERY Exists

Traditionally, HTTP APIs normally use one of two patterns for searches.

A simple search can use `GET`:

```http
GET /api/work-logs?from=2026-09-01&to=2026-09-30&type=Work
```

This is clear and appropriate when there are only a few filters.

However, a more advanced query may require:

- multiple values for one field;
- many independent filters;
- nested AND/OR conditions;
- arrays of IDs;
- pagination;
- relation enrichment;
- sorting;
- larger structured query definitions.

For example:

```json
{
  "filters": {
    "categories": ["Office Work", "Grooming"],
    "types": ["Work", "Support", "AI"],
    "workModes": ["WFO (Office)", "WFH (Home)"],
    "projectIds": ["..."],
    "jiraIds": ["..."],
    "appraisal": false
  },
  "pageSize": 25,
  "includeRelations": true
}
```

Encoding all of this into a GET query string quickly becomes cumbersome.

Historically, APIs often solved this by using a POST endpoint such as:

```http
POST /api/work-logs/search
```

with the filter definition in the request body.

That works technically, but POST does not communicate the important fact that the operation is a read-only query.

HTTP `QUERY` was designed specifically for this case.

---

## 3. What QUERY Means

A QUERY request asks the target resource to process the supplied query representation and return the result.

Example:

```http
QUERY /api/work-logs
Content-Type: application/json
Authorization: Bearer <token>
```

Body:

```json
{
  "filters": {
    "types": ["Work", "Support"],
    "categories": ["Office Work"]
  },
  "pageSize": 25,
  "includeRelations": true
}
```

The important semantic guarantees are:

```text
Safe       = Yes
Idempotent = Yes
Read-only  = Yes
```

The request may perform database searches, filtering, joins or enrichment, but it must not intentionally change application state.

---

## 4. Safe Requests

In HTTP terminology, a method is considered **safe** when the client is not requesting a state-changing operation.

Examples of safe operations are:

```text
GET
HEAD
OPTIONS
QUERY
```

A Work Tracker QUERY such as:

```http
QUERY /api/jiras
```

may read JIRAs, Sprint relations and Project relations.

It must not:

- create a JIRA;
- edit a JIRA;
- change a Sprint;
- update Notion;
- revoke a session;
- create another resource.

This is one of the main differences between `QUERY` and `POST`.

---

## 5. Idempotent Requests

An HTTP operation is idempotent when repeating the same request has the same intended effect as performing it once.

For example, executing this request repeatedly:

```http
QUERY /api/jiras
```

with:

```json
{
  "filters": {
    "statuses": ["In progress", "Cancelled"]
  }
}
```

does not create additional state each time.

The returned data may naturally change if the underlying Notion content changes, but the QUERY operation itself does not mutate that content.

This makes QUERY semantically suitable for automatic retry, network retry, repeated refresh and polling-style read operations.

---

## 6. GET vs QUERY vs POST vs PUT vs PATCH

| Method | Safe | Idempotent | Request body intended | Main purpose |
|---|---|---|---|---|
| GET | Yes | Yes | No defined query-body semantics | Retrieve a resource |
| QUERY | Yes | Yes | Yes | Complex read/search |
| POST | No safety guarantee | Not inherently | Yes | Create/process |
| PUT | No | Yes | Yes | Replace a resource |
| PATCH | No | Not inherently | Yes | Partially modify a resource |
| DELETE | No | Yes by HTTP semantics | Usually unnecessary | Remove/archive a resource |

The important distinction for Work Tracker is:

```text
GET    = simple read
QUERY  = complex read
POST   = create
PATCH  = update
```

---

## 7. Why Not Use GET for Everything?

GET remains the best choice for simple retrieval.

Examples:

```http
GET /api/jiras
GET /api/jiras/active
GET /api/sprints/active
GET /api/work-logs
```

Simple filters also work well:

```http
GET /api/work-logs?from=2026-09-01&to=2026-09-30
```

The problem begins when many parameters need to be encoded into the URI.

A hypothetical advanced GET might need categories, several types, several work modes, project IDs, JIRA IDs, appraisal state, page size and relation expansion all at once.

This has several disadvantages:

- URLs become long;
- arrays require conventions;
- nested conditions are awkward;
- encoding makes URLs difficult to read;
- query definitions can become harder to maintain;
- URLs are commonly stored in access logs and browser history;
- different infrastructure components can impose different URI-length limits.

QUERY moves the query definition into structured request content.

---

## 8. Why Not Use POST for Queries?

Before QUERY existed, POST was commonly used for advanced searches.

For example:

```http
POST /api/jiras/search
```

Technically this works.

The problem is semantics. POST does not tell a client, proxy or monitoring tool that the operation is guaranteed to be a read-only query.

With:

```http
QUERY /api/jiras
```

the intention is explicit:

```text
This operation performs a query.
It is safe.
It is idempotent.
It does not mutate the resource.
```

---

## 9. Why QUERY Is Not a Replacement for POST

QUERY should never be used for operations such as creating Work Logs, creating Feedback, logging in, allocating work, or triggering another state-changing workflow.

For example:

```http
POST /api/work-logs
```

means “Create a Work Log”, while:

```http
QUERY /api/work-logs
```

means “Search Work Logs”.

---

## 10. Why QUERY Is Not PUT or PATCH

`PUT` and `PATCH` are mutation methods.

`PUT` generally replaces resource state.

`PATCH` partially changes a resource.

For example:

```http
PATCH /api/work-links/<pageId>
```

may update only the Notes property.

`QUERY /api/work-links` is different because it only searches Work Links and does not modify them.

---

## 11. Work Tracker QUERY Contract

The Work Tracker API uses JSON for QUERY request content.

Required headers:

```http
Content-Type: application/json
Authorization: Bearer <access-token>
```

General structure:

```json
{
  "filters": {},
  "pageSize": 25,
  "cursor": null,
  "includeRelations": true
}
```

| Property | Description |
|---|---|
| `filters` | Domain-specific filters |
| `pageSize` | Maximum page size |
| `cursor` | Notion pagination cursor |
| `includeRelations` | Whether relation enrichment is requested |

Raw Notion query JSON is not exposed to clients. The Worker accepts domain filters and translates them internally.

---

## 12. Filter Semantics

Work Tracker uses:

```text
OR within the same field
AND between different fields
```

Example:

```json
{
  "filters": {
    "types": ["Work", "Support"],
    "workModes": ["WFO (Office)", "WFH (Home)"]
  }
}
```

means:

```text
(Type = Work OR Type = Support)
AND
(Work Mode = WFO (Office) OR Work Mode = WFH (Home))
```

---

## 13. QUERY /api/work-logs

Example:

```http
QUERY /api/work-logs
```

Request:

```json
{
  "filters": {
    "from": "2026-09-01",
    "to": "2026-09-30",
    "categories": ["Office Work"],
    "types": ["Work", "Support"],
    "workModes": ["WFO (Office)", "WFH (Home)"],
    "appraisal": false
  },
  "pageSize": 25,
  "includeRelations": true
}
```

Supported filters include:

```text
from
to
categories
types
workModes
projectIds
jiraIds
appraisal
```

---

## 14. QUERY /api/feedback

Example:

```http
QUERY /api/feedback
```

Request:

```json
{
  "filters": {
    "contexts": ["Appraisal", "Half-Yearly Appraisal"],
    "feedbackTypes": ["Positive", "Improvement"]
  },
  "pageSize": 25,
  "includeRelations": true
}
```

Supported filters include:

```text
from
to
companyIds
teamIds
personTypes
contexts
feedbackTypes
```

Feedback currently uses:

```text
Company   -> Relation
Work Type -> Rollup from Company
Team      -> Relation
```

`Work Type` is read-only and derived by Notion.

---

## 15. QUERY /api/work-links

Example:

```http
QUERY /api/work-links
```

Request:

```json
{
  "filters": {
    "types": ["CI/CD", "Sprint Dashboard"],
    "active": true,
    "q": "Jupiter"
  },
  "pageSize": 25,
  "includeRelations": true
}
```

Supported filters include:

```text
companyIds
projectIds
types
active
q
```

---

## 16. QUERY /api/jiras

Example:

```http
QUERY /api/jiras
```

Request:

```json
{
  "filters": {
    "statuses": ["In progress", "Cancelled"],
    "tags": ["DevOps", "Dependency"],
    "inActiveSprint": true
  },
  "pageSize": 25,
  "includeRelations": true
}
```

Supported filters include:

```text
statuses
tags
sprintIds
projectIds
inActiveSprint
spillover
appraisal
demoRequired
q
```

Current known JIRA statuses are:

```text
Not started
Cancelled
Blocked
In progress
Done
```

The API keeps status as an open string so future Notion statuses can pass through unchanged.

---

## 17. Pagination

QUERY uses the same cursor-based pagination model as existing GET APIs.

Response shape:

```json
{
  "data": [],
  "count": 25,
  "hasMore": true,
  "nextCursor": "..."
}
```

Offset pagination is not used.

---

## 18. Relation Enrichment

QUERY supports the same relation enrichment behavior as GET when `includeRelations` is enabled.

This means responses can contain both relation IDs and normalized relation objects, such as Projects, JIRAs, Teams, Companies or Sprints.

---

## 19. Accept-Query

RFC 10008 defines the `Accept-Query` response field.

Work Tracker advertises:

```http
Accept-Query: application/json
```

for resources that actually support QUERY:

```text
/api/jiras
/api/work-logs
/api/feedback
/api/work-links
```

Metadata endpoints such as `/api/work-logs/meta` do not advertise `Accept-Query` because they do not accept QUERY themselves.

---

## 20. OPTIONS and Method Discovery

Clients can use `OPTIONS` to inspect supported methods.

Example:

```http
OPTIONS /api/work-logs
```

can advertise:

```http
Allow: GET, QUERY, POST, OPTIONS
Accept-Query: application/json
```

For JIRAs:

```http
Allow: GET, QUERY, OPTIONS
Accept-Query: application/json
```

Writable item URLs such as `/api/work-logs/<pageId>` can advertise `PATCH, OPTIONS` separately.

---

## 21. CORS and Browser Applications

Office Orbit runs in a browser and on Android through Capacitor.

`QUERY` is not a CORS simple/safelisted method, so cross-origin browser calls are preflighted with `OPTIONS`.

The Worker allows:

```http
Access-Control-Allow-Methods: GET, QUERY, POST, PATCH, DELETE, OPTIONS
Access-Control-Expose-Headers: Accept-Query
```

---

## 22. Angular Usage

Angular `HttpClient` can send QUERY with `request()`:

```ts
this.http.request<ListResponse<Jira>>(
  'QUERY',
  `${environment.apiBaseUrl}/api/jiras`,
  {
    body: {
      filters: {
        statuses: ['In progress', 'Cancelled'],
        tags: ['DevOps', 'Dependency'],
      },
      pageSize: 25,
      includeRelations: true,
    },
  },
);
```

The existing auth interceptor can continue adding the Bearer token because QUERY is still a normal Angular `HttpRequest`.

---

## 23. JavaScript Fetch Usage

```js
const response = await fetch(apiUrl, {
  method: 'QUERY',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    filters: {
      statuses: ['In progress', 'Cancelled'],
    },
    pageSize: 25,
  }),
});

const result = await response.json();
```

---

## 24. curl Usage

`QUERY` is an HTTP method, not a shell command.

This is wrong:

```bash
QUERY /api/jiras
```

Use an HTTP client such as curl:

```bash
curl -i -X QUERY \
  http://localhost:8787/api/jiras \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "filters": {
      "statuses": ["In progress", "Cancelled"]
    },
    "pageSize": 25,
    "includeRelations": true
  }'
```

---

## 25. Error Handling

Typical responses include:

```text
200 OK                valid query
400 Bad Request       malformed body, invalid filters, dates, IDs, page size or cursor
401 Unauthorized      missing/invalid/expired/revoked access token
415 Unsupported Media Type
                      unsupported QUERY body media type
```

Supported request media type:

```http
Content-Type: application/json
```

---

## 26. Authentication

QUERY uses the same Bearer authentication and active-session validation as other protected methods.

There is no special authentication path for QUERY.

---

## 27. Internal Notion Mapping

Office Orbit can send:

```http
QUERY /api/work-logs
```

while the Worker internally calls Notion using:

```text
POST /v1/data_sources/{dataSourceId}/query
```

This is valid because HTTP method semantics apply independently at each client/server boundary.

```text
Office Orbit
     |
     | QUERY /api/work-logs
     v
Work Tracker API
     |
     | POST /v1/data_sources/{id}/query
     v
Notion API
```

The Worker hides Notion's transport details from Office Orbit.

---

## 28. Is QUERY More Efficient?

QUERY is not automatically faster than GET or POST.

The HTTP method itself does not improve database execution speed.

Its efficiency advantages are architectural and representational:

- structured JSON instead of long encoded URLs;
- arrays without repeated query parameters;
- cleaner complex filter structures;
- simpler validation;
- server-side filtering instead of client-side filtering;
- fewer broad requests followed by local filtering;
- safe retry semantics;
- one expressive request instead of multiple narrower ones.

The real performance gain comes from pushing filtering to Notion rather than downloading broad result sets and filtering them in Angular.

---

## 29. Caching

RFC 10008 allows QUERY responses to be cacheable, but authenticated Work Tracker QUERY responses currently use:

```http
Cache-Control: no-store
```

This is intentional because the API contains personal and work information.

---

## 30. Retry Behavior

Because QUERY is safe and idempotent, retrying a failed query is semantically safer than blindly retrying a POST that may create another resource.

For example, retrying:

```http
QUERY /api/work-logs
```

should not create or modify data.

Retrying:

```http
POST /api/work-logs
```

could create another Work Log unless the create operation has separate idempotency protection.

---

## 31. Security and Privacy

Moving complex query content from a URL into a QUERY body can reduce exposure in browser history and URL-oriented logs, but it is not a security mechanism.

Request bodies can still be logged by infrastructure.

Therefore:

- HTTPS remains required;
- Bearer tokens must remain protected;
- request bodies should not contain unnecessary secrets;
- authorization is required exactly as with GET;
- production logging should avoid sensitive request content.

---

## 32. Infrastructure Compatibility

QUERY is newer than GET, POST, PUT, PATCH and DELETE, so compatibility should be considered across proxies, CDNs, WAFs, API gateways, monitoring tools and HTTP clients.

In the current Work Tracker stack:

- Cloudflare Workers can receive QUERY requests;
- Angular can send QUERY with `HttpClient.request()`;
- browsers use CORS preflight;
- existing GET endpoints are retained for backward compatibility and incremental adoption.

---

## 33. When to Use GET

Prefer GET for simple retrieval:

```http
GET /api/jiras
GET /api/jiras/active
GET /api/work-links/active
GET /api/sprints/active
GET /api/work-logs?from=2026-09-01
```

GET remains familiar, easy to test, easy to bookmark and widely supported.

---

## 34. When to Use QUERY

Prefer QUERY when:

- several filters are combined;
- filters contain arrays;
- URLs would become long or difficult to understand;
- richer logical conditions are needed;
- a structured JSON contract is clearer;
- the operation must clearly remain read-only.

Examples:

```text
Work Logs by Category + Type + Work Mode + Project + JIRA + date range
JIRAs by Status + Tags + Sprint + Spillover state
Feedback by Context + Feedback Type + Company + Team + date range
```

---

## 35. When Not to Use QUERY

Do not use QUERY for:

```text
login
logout
create
update
delete
approve
revoke
allocate
release
send
trigger
```

Use the appropriate mutation method instead.

---

## 36. Method Selection in Work Tracker

```text
GET
Simple reads

QUERY
Complex read-only searches

POST
Create a resource or start a state-changing operation

PATCH
Partially modify a resource

DELETE
Remove/revoke a resource where supported

OPTIONS
Discover supported methods and handle CORS preflight
```

---

## 37. Example End-to-End Flow

Angular user selects:

```text
Category: Office Work
Type: Work, Support
Work Mode: WFO (Office), WFH (Home)
```

Angular sends:

```http
QUERY /api/work-logs
```

Worker then:

```text
1. Authenticates bearer token
2. Validates Content-Type
3. Parses JSON
4. Rejects unknown filters
5. Builds Work Log domain filters
6. Converts them to Notion filters
7. Queries the Notion data source
8. Maps Notion pages
9. Enriches requested relations
10. Returns normalized Work Tracker JSON
```

No Notion data is modified.

---

## 38. Benefits for Office Orbit

QUERY gives Office Orbit a cleaner foundation for advanced search, including:

```text
Find all Work Logs for a JIRA across a date range
Find Office Work of type Work OR Support while working WFO or WFH
Find Feedback with Appraisal or Half-Yearly Appraisal and Positive or Improvement type
Find JIRAs that are In progress or Cancelled and tagged DevOps or Dependency
```

---

## 39. Design Principles

1. QUERY is read-only.
2. GET remains available.
3. QUERY never accepts raw Notion filters.
4. Clients use domain-oriented filter names.
5. Different filter fields use AND semantics.
6. Multiple values in one field use OR semantics.
7. Pagination remains cursor based.
8. Authentication is identical to other protected API methods.
9. QUERY does not bypass relation enrichment.
10. QUERY does not mutate Notion.
11. Complex filtering should be executed by Notion where possible.
12. The Worker should not retrieve all rows merely to filter them locally.
13. QUERY responses containing work data currently use `no-store`.
14. Unknown fields are rejected rather than silently ignored.

---

## 40. Summary

HTTP QUERY provides a standardized method for complex read-only API operations.

It combines:

```text
GET-like semantics
+
POST-like structured request content
```

without treating a query as a mutation.

For Work Tracker:

```text
GET    -> simple retrieval
QUERY  -> advanced retrieval
POST   -> create
PATCH  -> update
DELETE -> remove/revoke where supported
```

QUERY does not inherently make an operation faster.

Its main advantages are:

- clearer HTTP semantics;
- structured request bodies;
- safer retry semantics;
- cleaner complex filters;
- less dependence on very long query strings;
- better separation between reads and writes;
- easier future expansion of Office Orbit search capabilities.

Existing GET endpoints remain important and continue to be supported.

QUERY is used only where it provides a clear benefit.

---

## References

- RFC 10008 — The HTTP QUERY Method
- RFC 9110 — HTTP Semantics
- IANA HTTP Method Registry
- IANA HTTP Field Name Registry
- Work Tracker API knowledge base: `knowledge-base/http-query-method.md`
