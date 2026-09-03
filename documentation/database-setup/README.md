# Work Tracker Database Setup

This folder documents the data-model and database setup used by Work Tracker.

## Documents

### Notion Hierarchy

[`notion-hierarchy.md`](./notion-hierarchy.md)

Shows the Work Tracker page structure, databases, and important database views.

### Notion Database Schema

[`notion-schema.md`](./notion-schema.md)

The primary reference for configuring the Work Tracker databases in Notion,
including properties, relations, rollups, formulas, views, buttons, and
normal workflows.

### SQL Equivalent Schema

[`sql-equivalent-schema.md`](./sql-equivalent-schema.md)

A PostgreSQL-style relational equivalent of the Notion data model.

It is maintained as a technical reference and possible migration design.
Notion remains the current persistence layer for Work Tracker.