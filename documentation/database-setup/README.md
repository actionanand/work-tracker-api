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
Notion remains the persistence layer for Work Tracker domain records. The Worker
also uses its existing `AUTH_DB` D1 database for auth/settings and the encrypted
[Credential Vault](../../knowledge-base/credential-vault-api.md). Vault setup uses
`migrations/0004_credential_vault.sql`; it is not part of the PostgreSQL-style
reference schema above.
