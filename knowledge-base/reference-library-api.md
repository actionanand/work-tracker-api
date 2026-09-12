# Reference Library API

The Reference Library API exposes direct child pages under the configured Notion `REFERENCE_LIBRARY_PAGE_ID`.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/reference-library` | Paginated direct child-page list. |
| `GET` | `/api/reference-library/:pageId` | Detail response with markdown. The page must be a direct child of the configured parent page. |
| `POST` | `/api/reference-library/import` | Import a `.md` or `.markdown` file as a normal child page. |
| `GET` | `/api/reference-library/imports/:taskId` | Poll async markdown import status. |

Reference Library does not support HTTP `QUERY`.

## Import Rules

Imports use `multipart/form-data` with a `file` field. Files must be non-empty `.md` or `.markdown` files and must be no larger than `4,500,000` bytes. The sanitized filename stem becomes the child page title.

If Notion accepts the markdown creation asynchronously, the API returns HTTP 202 with `taskId` and `pollAfterSeconds`; clients should poll the imports endpoint.
