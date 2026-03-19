---
applyTo: "packages/backend/**"
---

# Backend Scoped Instructions (`packages/backend`)

## Runtime and Architecture
- Backend code is TypeScript Lambda logic running on Node.js 20 for API Gateway events.
- Main handler contract currently supports:
  - `POST /api/register` with email/password and role (`author` or `reader`)
  - `POST /api/login` with email/password returning JWT auth token
  - `GET /api/posts` with `page` and `limit` query params returning `{ items, pagination }` (list `content` is truncated to 200 chars)
    - public listing returns published posts only
  - `GET /api/posts?mine=true&page={page}&limit={limit}` for authenticated user posts (includes drafts)
  - `GET /api/posts?id={id}` returning a single post with full `content` (compatibility fallback)
  - `GET /api/posts/{id}` returning a single post with full `content` (unpublished posts only visible to owner)
  - `POST /api/posts` (author role only)
  - `PUT /api/posts/{id}` (author owner only)
  - `DELETE /api/posts/{id}` (author owner only)
- Keep CORS-compatible responses and JSON payloads.

## Data and Contract Rules
- Preserve response field naming with `createdAt`.
- Preserve post response fields: `id`, `title`, `content`, `createdAt`, `author`, `published`.
- Validate incoming payloads for required fields (`title`, `content`) and optional boolean `published`.
- Preserve role semantics: `author` can create/update/delete own posts, `reader` can browse published posts.
- Keep local no-deploy support using `LOCAL_DEV=true` behavior.

## Dependencies and Design
- Keep dependencies minimal.
- Avoid introducing unnecessary frameworks.
- Keep handler logic small and testable.

## Testing
- For backend logic changes, verify with:
  - `pnpm --filter @serverless-blog/backend test`

## Documentation
- Every function must include a comment or docstring that clearly explains its purpose in plain language.
- If backend setup, local run behavior, or deployment flow changes, update `README.md` sections for:
  - Requirements
  - Local requirements
  - `.env` file creation
  - Local run steps
  - AWS deployment steps

## Scope Control
- Avoid changing frontend or CDK infra unless required for backend correctness.
- Keep changes minimal and aligned with existing handler patterns.
