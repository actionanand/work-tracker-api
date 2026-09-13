# JIRA Picker API

`QUERY /api/jiras/options` is a lightweight autocomplete API for selecting JIRA relations in Task and follow-up forms.

## Contract

```http
QUERY /api/jiras/options
Content-Type: application/json
Authorization: Bearer <accessToken>
```

```json
{
  "filters": {
    "q": ""
  },
  "pageSize": 20,
  "cursor": null
}
```

Allowed top-level fields are `filters`, `pageSize`, `cursor`, and `includeRelations`. `includeRelations: true` is rejected. The only allowed filter is `q`.

## Default Picker Load

When `q` is missing, empty, or whitespace, the Worker queries Notion with:

```text
In Active Sprint = true
```

This gives the picker the current sprint JIRAs without loading the full JIRA data set.

## Search

When `q` has text, the Worker searches all JIRAs, including historical, non-sprint, external dependency, platform, and DevOps records.

Search fields:

```text
JIRA Key contains q
OR
Summary contains q
```

The active-sprint filter is not applied during search.

## Response

```json
{
  "data": [
    {
      "id": "jira-page-id",
      "jiraKey": "CRI-1234",
      "summary": "Short summary",
      "status": "In progress",
      "inActiveSprint": true
    }
  ],
  "count": 1,
  "hasMore": false,
  "nextCursor": null
}
```

No tags, relation IDs, demo fields, spillover fields, relation enrichment, sprint history, or Sprint Allocation data are returned.

## Client Flow

```text
Open picker
  -> QUERY /api/jiras/options with no q
  -> current Sprint JIRAs

User types search text
  -> debounce around 300ms client-side
  -> QUERY /api/jiras/options with q
  -> search all JIRAs

User clears search
  -> reset cursor
  -> QUERY /api/jiras/options with no q
  -> current Sprint JIRAs again
```

Cursor values are opaque. Reset the cursor whenever `q` changes.
