# Repository Instructions

# Repository Instructions

## Project Overview
- This repository is a pnpm monorepo for a serverless blogging platform.
- Frontend: React 18+, TypeScript, Vite, Tailwind CSS in `apps/web`.
- Backend: TypeScript AWS Lambda handlers (Node.js 20) in `packages/backend`.
- Infrastructure: AWS CDK (TypeScript) in `packages/infra`.

## Monorepo Rules
- Keep changes scoped to the relevant package.
- Reuse existing structure and naming patterns.
- Do not introduce new package managers; use `pnpm` for Node work.
- Prefer minimal changes over broad refactors.

## Quality Rules
- Frontend changes must build with:
  - `pnpm --filter @serverless-blog/web build`
- Backend critical logic changes should keep tests passing:
  - `pnpm --filter @serverless-blog/backend test`
- Keep TypeScript strict-mode compatible.

## Agent Validation Rules
- Add tests for new functionality.
- After modifying or adding files/features, run relevant checks for changed areas:
  - Frontend build: `pnpm --filter @serverless-blog/web build`
  - Backend tests: `pnpm --filter @serverless-blog/backend test`
  - Infrastructure synthesis when infra changes: `pnpm --filter @serverless-blog/infra cdk synth`


## API and Data Rules
- Public API contract for blog posts:
  - `POST /api/register` with `email`, `password`, and `role` (`author` or `reader`)
  - `POST /api/login` with `email` and `password`
  - `GET /api/posts` with pagination query params (`page`, `limit`) returning `{ items, pagination }`
  - `GET /api/posts?mine=true&page=<n>&limit=<n>` for authenticated user posts
  - `GET /api/posts/{id}`
  - `POST /api/posts` (author only)
  - `PUT /api/posts/{id}` (author owner only)
  - `DELETE /api/posts/{id}` (author owner only)
- Response field naming uses `createdAt` (camelCase).
- Preserve post response fields: `id`, `title`, `content`, `createdAt`, `author`, `published`.
- Preserve role semantics:
  - `reader` can browse published content
  - `author` can create/edit/delete own posts and manage draft/published status
- Local no-deploy mode is supported through SAM and `LOCAL_DEV=true`.

## Documentation Rules
- Update `README.md` when commands, setup, deployment, or architecture changes.
- Keep examples aligned with `.env.example` and current scripts.
- Every function must include a comment or docstring that clearly explains its purpose in plain language.
- Keep `README.md` sections clear and current for:
  - Requirements
  - Local requirements
  - `.env` file creation
  - Local run steps
  - AWS deployment steps
