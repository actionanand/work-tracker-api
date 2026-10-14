# Historical Analytics API

## Endpoint and Range

```http
GET /api/analytics?from=2025-10-14&to=2026-10-14
Authorization: Bearer <accessToken>
```

Uses the existing global authentication. No request body, Analytics-specific login, or write API exists. OPTIONS advertises `Allow: GET, OPTIONS`. POST, PATCH, DELETE and QUERY return 405; Analytics does not advertise `Accept-Query`. Existing global CORS policy is unchanged.

Both `from` and `to` are required exactly once, in strict `YYYY-MM-DD` format. Impossible dates, surrounding whitespace and timestamps are rejected. `from <= to`; both endpoints are inclusive. A request may span at most **370 inclusive calendar days**, including leap-year boundaries. Date arithmetic uses UTC date-only values, not the server's local timezone.

HTTP 400 codes:

| Code | Meaning |
| --- | --- |
| `ANALYTICS_DATE_INVALID` | Missing, repeated, malformed or impossible `from`/`to`; response identifies `parameter` |
| `ANALYTICS_RANGE_INVALID` | `from` is after `to` |
| `ANALYTICS_RANGE_TOO_LARGE` | More than 370 days; response includes `maxDays: 370` |

```json
{ "error": "Analytics range is too large", "code": "ANALYTICS_RANGE_TOO_LARGE", "maxDays": 370 }
```

Responses use `Cache-Control: no-store`, including validation/upstream errors and OPTIONS. There is no CDN caching or server-side Analytics cache. Office Orbit may cache the response in application memory. Chart.js belongs entirely to Office Orbit; the Worker returns JSON and has no chart package.

## Response Contract

The top-level `schemaVersion` is `1`. `generatedAt` is a server-generated UTC ISO timestamp. `from` and `to` echo the validated range. An empty result is a successful HTTP 200:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-15T00:00:00.000Z",
  "from": "2025-10-14",
  "to": "2026-10-14",
  "workActivity": { "count": 0, "weeks": [], "categories": [], "types": [] },
  "spillSummary": {
    "distinctJiras": 0,
    "jirasWithAnySpill": 0,
    "totalSpillEvents": 0,
    "spillPercentage": 0,
    "averageSpillsPerSpilledJira": 0
  },
  "spillTrend": null,
  "sprints": [],
  "topSpilledJiras": []
}
```

Analytics is independent from the current-state `/api/dashboard` API. There are no company/project query filters in v1.

## Work Activity

Work Logs are queried from Notion using inclusive Date bounds, following every collection cursor. Undated and out-of-range logs are excluded. Repeated page IDs are counted once.

- `count`: number of Work Logs, not hours or days worked.
- `weeks`: `{ weekStart: "YYYY-MM-DD", count }`, Monday-based and sorted ascending. Only populated weeks are returned. A boundary week's Monday can precede `from`.
- `categories`: `{ label, count }`, using `category || "Uncategorized"`.
- `types`: `{ label, count }`, using `type || "Unspecified"`.

Category/type lists sort by count descending, then label ascending. Date fields use their calendar-date component without shifting an embedded timestamp through a local timezone; Sunday and Monday remain in their corresponding date-only weeks. Current Work Log JIRA status/relations rollups do not contribute historical status metrics.

## Sprint Selection and Full History

The complete Sprint catalog is loaded once per Analytics request, following pagination. A Sprint is selected when `End Date >= from AND Start Date <= to`, matching the existing Sprint overlap semantics. Sprints without both dates are not selected.

Returned Sprints and each JIRA's full resolved history use the existing JIRA-history ordering: Start Date ascending, End Date ascending, Sprint name ascending, ID ascending. The catalog is not truncated to the requested interval before classifying spills. Unresolvable Sprint references are not synthesized into Sprint records, matching existing reference-resolution behavior.

Each relevant JIRA is counted once by page ID, and each Sprint relation once by ID. A JIRA is relevant when its Sprint relation includes at least one selected Sprint. Membership comes from JIRA `Sprints`, **not** from Sprint Allocations. Every consecutive transition in the complete ordered history represents a spill, regardless of today's `spillover`, `spilloverCount`, Active or Status values.

For `A -> B -> C`, a request selecting only B still reports one incoming and one outgoing spill for B. This also counts B's outgoing transition to C even when C is outside the interval.

## Per-Sprint Metrics

Every `sprints` item contains:

| Field | Meaning |
| --- | --- |
| `id`, `sprint`, `startDate`, `endDate`, `active` | Current Sprint metadata |
| `jiraCount` | Distinct JIRAs whose Sprint relation includes this Sprint |
| `incomingSpillJiras` | Member JIRAs for which this is not the first Sprint in full history |
| `outgoingSpillJiras` | Member JIRAs for which this is not the last Sprint in full history |
| `outgoingSpillRate` | Outgoing / JIRA count * 100; zero if no members |
| `capacityDays`, `availableDays` | Values mapped from the Sprint |
| `plannedDays` | Sum of unambiguous Sprint/JIRA allocation contributions |
| `remainingPlannedDays` | Available Days minus calculated Planned Days |
| `utilizationPercent` | Planned / Available * 100 when Available > 0 |
| `allocationConflictPairs` | Number of Sprint/JIRA pairs having multiple distinct allocation pages |

For `A: Sprint 1`, `B: Sprint 1 -> Sprint 2`, `C: Sprint 1 -> Sprint 2 -> Sprint 3`:

| Sprint | JIRAs | Incoming | Outgoing | Outgoing Rate |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3 | 0 | 2 | 66.666... |
| 2 | 2 | 2 | 1 | 50 |
| 3 | 1 | 1 | 0 | 0 |

## Spill Summary and Trend

The selected-period rule counts a spill **when its FROM Sprint is selected**, not based on the receiving Sprint or a current formula.

- `distinctJiras`: distinct relevant JIRAs.
- `jirasWithAnySpill`: relevant JIRAs with at least one selected-period outgoing transition.
- `totalSpillEvents`: number of those outgoing transitions.
- `spillPercentage`: JIRAs with any selected-period spill / relevant JIRAs * 100.
- `averageSpillsPerSpilledJira`: selected-period events / JIRAs with any selected-period spill.

Ratios with zero denominators return zero. A JIRA with incoming history but no selected outgoing transition is not counted in `jirasWithAnySpill`.

`spillTrend` compares the first and latest chronologically selected Sprints with `jiraCount > 0`. Fewer than two qualifying Sprints returns `null`. Otherwise it contains `firstSprintRate`, `latestSprintRate`, `changePercentagePoints = latest - first`, and `direction`: negative is `improving`, positive is `worsening`, zero is `unchanged`. Empty Sprints are not trend anchors. The full Sprint series remains authoritative; this summary does not measure statistical significance or adjust for Sprint sample sizes.

## Top Spilled JIRAs

`topSpilledJiras` returns at most ten relevant JIRAs with nonzero full-history spill counts. Each row contains `id`, `jiraKey`, `summary`, `fullHistorySpillCount = max(0, resolved history length - 1)` and `selectedRangeOutgoingSpillCount` using the same selected FROM-Sprint rule.

Sort order: full-history count descending, selected-range count descending, JIRA key ascending, ID ascending. A row may have selected-range count zero while retaining prior full-history spills. JIRAs outside all selected Sprints are excluded.

## Capacity and Allocation Quality

Sprint Allocation pages are grouped by Sprint/JIRA pair after page-ID deduplication. A missing pair contributes zero. Exactly one row contributes its mapped Planned Days. Multiple distinct rows for a pair increment `allocationConflictPairs` once and contribute **zero**: the API neither picks an arbitrary row nor sums conflicting values. Rows missing a Sprint/JIRA relation have no pair and contribute nothing. If a row relates multiple Sprint/JIRA IDs, it participates in each represented pair.

These totals use allocation values, never Sprint Allocated Days or Remaining Days rollups, which may lag. Allocation membership does not create JIRA Sprint membership for counting purposes. Conflicted totals are conservative/incomplete; clients should show the conflict flag rather than treating remaining capacity as authoritative. Analytics does not repair, create or mutate allocations.

Arbitrary decimal precision is retained without intentional rounding. Remaining Planned Days may be negative. Utilization is **not clamped** when availability is positive: 10 planned / 8 available gives 125%. When availability <= 0, utilization is zero if planned is zero, otherwise 100%.

## Query Strategy and Limitations

After loading the complete Sprint catalog, selected Sprint IDs are processed sequentially in chunks of at most 20. JIRAs are queried with `Sprints contains any selected ID`; allocations use `Sprint contains any selected ID`. A single-ID chunk uses the equivalent direct relation filter. Every chunk follows all collection cursors, then pages are deduplicated across overlapping filters. Work Logs are separately date-bounded. No selected Sprints means JIRA/allocation queries are skipped, but Work Activity is still calculated.

There are no per-JIRA, per-Sprint or per-allocation page/catalog lookups, no shallow relation enrichment and no unbounded parallel request fan-out. Notion collection queries use HTTP POST `/v1/data_sources/{id}/query` as **read operations**; no Notion page mutation occurs. Analytics does not use D1, add migrations or materialize results. Existing global auth/session maintenance behavior is unchanged.

Reliable spill classification requires a complete JIRA Sprint relation in the collection response. If Notion explicitly marks `Sprints.has_more`, Analytics fails safely with 502 instead of returning a shortened history or adding N+1 property fetches. API-visible catalog permissions and current relation data bound what can be resolved. Notion reads are not a cross-datasource snapshot; concurrent planning or external changes can affect results. Capacity/allocation values reflect currently stored planning records, not an immutable historical audit log.

Historical JIRA Status cannot be inferred from today's Status or Work Log status rollups. The API intentionally provides no historical Done, Blocked, In Progress or status-distribution metrics. A future event source would be needed for those claims.

Upstream failures return safe HTTP 502, with only a fixed log marker and no raw Notion bodies, token, request internals or stack:

```json
{ "error": "Analytics data is temporarily unavailable", "code": "ANALYTICS_UPSTREAM_ERROR" }
```
