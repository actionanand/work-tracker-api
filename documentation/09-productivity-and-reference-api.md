# Productivity and Reference API

The Productivity and Reference phase adds protected APIs for To Dos, Tasks, Memos, and the Reference Library.

## Scope

- To Dos, Tasks, and Memos are Notion data-source resources.
- Reference Library articles are rows in a Notion data source with page-body Markdown.
- Advanced collection filtering uses HTTP `QUERY` for data-source resources.
- Writes are allow-listed and validate option IDs, page IDs, and ownership before mutating Notion.
- Deletes move owned pages to Notion trash.
- Todo recurrence is stored in Notion and validated by the Worker before writes.
- Weekly week-off settings use the existing authenticated D1 database.

## Notion Bindings

The Worker requires these non-secret Wrangler vars:

```text
TODOS_DATA_SOURCE_ID
TASKS_DATA_SOURCE_ID
MEMOS_DATA_SOURCE_ID
REFERENCE_LIBRARY_DATA_SOURCE_ID
```

The Notion token remains a Worker secret and must not be stored in source, docs, or client apps.

## Markdown Handling

Memo and Reference Library detail responses include page-body markdown. Memo writes update that markdown body synchronously. Reference Library imports preserve uploaded Markdown while creating article rows in the configured data source using the existing asynchronous import flow.

## Calendar Boundary

The Worker stores Todo recurrence fields, the manual `Workday Adjust` flag, and configured weekly week-off days. Google Sheets holidays and previous-working-day reminder calculations remain Office Orbit responsibilities.

## API References

- [To Do API](../knowledge-base/todo-api.md)
- [Work Calendar API](../knowledge-base/work-calendar-api.md)
- [Task API](../knowledge-base/task-api.md)
- [Memo API](../knowledge-base/memo-api.md)
- [Reference Library API](../knowledge-base/reference-library-api.md)
