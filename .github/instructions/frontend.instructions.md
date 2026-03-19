---
applyTo: "apps/web/**"
---

# Frontend Scoped Instructions (`apps/web`)

## Stack and Standards
- Use React 18+, TypeScript, Vite, and Tailwind CSS patterns already present.
- Keep strict TypeScript compatibility.
- Prefer functional components and hooks.

## API Integration
- Use `VITE_API_BASE_URL` from frontend environment configuration.
- Keep API routes aligned with backend contract:
  - `POST /api/register` with `email`, `password`, and `role`
  - `POST /api/login` with `email` and `password`
  - `GET /api/posts` with `page` and `limit` query params returning `{ items, pagination }` (list `content` is truncated to 200 chars)
  - `GET /api/posts?mine=true&page={page}&limit={limit}` for authenticated user posts
  - `GET /api/posts?id={id}` returning a single post with full `content` (compatibility fallback)
  - `GET /api/posts/{id}` returning a single post with full `content`
  - `POST /api/posts` (author role only)
  - `PUT /api/posts/{id}` (author owner only)
  - `DELETE /api/posts/{id}` (author owner only)
- Preserve blog post shape:
  - `id`, `title`, `content`, `createdAt`, `author`, `published`
- Preserve role UX behavior:
  - register supports selecting `author` or `reader`
  - readers can browse published posts
  - authors can create/edit/delete their own posts

## Styling and UX
- Use Tailwind utility classes.
- Keep the current visual style simple and consistent.
- Do not add a new UI framework.

## Validation
- For frontend changes, verify with:
  - `pnpm --filter @serverless-blog/web build`

## Documentation
- Every function must include a comment or docstring that clearly explains its purpose in plain language.
- If frontend environment usage or local run flow changes, update `README.md` sections for:
  - Requirements
  - Local requirements
  - `.env` file creation
  - Local run steps
  - AWS deployment steps

## Scope Control
- Avoid backend or infra edits unless required by the frontend change.
- Keep changes minimal and targeted.
