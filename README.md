# Serverless Blog Platform

Monorepo blog platform using React + Vite + Tailwind on the frontend and TypeScript AWS Lambda (Node.js 20) + API Gateway + DynamoDB on AWS CDK for infrastructure.

## Requirements

- Node.js 20+
- `pnpm` 9+

## Architecture overview

- `apps/web`: React 18 + TypeScript + Vite + Tailwind frontend
- `packages/backend`: TypeScript Lambda handlers (Node.js 20) with local SAM support
- `packages/infra`: AWS CDK stack provisioning API Gateway, Lambda, and DynamoDB

Request flow:
1. Frontend calls `${VITE_API_BASE_URL}/api/...`
2. API Gateway invokes the Lambda handler
3. Lambda reads/writes `BlogPosts` and `BlogUsers` DynamoDB tables

## Core features implemented

- User authentication with email/password and JWT tokens
- Two user roles:
  - `author`: can create, edit, and delete own posts
  - `reader`: can browse published posts
- Post management:
  - Create post with `title`, `content` (markdown/plain text), and `published` status
  - Edit own posts
  - Delete own posts
  - List own posts with `mine=true`
- Public blog:
  - Browse published posts only
  - View full post detail
  - Paginated list responses


### API routes

- `POST /api/register` (email/password with `role` as `author` or `reader`)
- `POST /api/login` (email/password, returns JWT)
- `GET /api/posts?page=<n>&limit=<n>` (public published posts)
- `GET /api/posts?mine=true&page=<n>&limit=<n>` (authenticated user posts)
- `GET /api/posts/{id}` (full post; unpublished visible only to owner)
- `POST /api/posts` (author only)
- `POST /api/posts/premium` (authenticated beta premium AI draft generation)
- `PUT /api/posts/{id}` (author owner only)
- `DELETE /api/posts/{id}` (author owner only)

### Auth and role notes

- Registration requires choosing a role: `author` or `reader`.
- Login returns a JWT token used as `Authorization: Bearer <token>`.
- `reader` accounts cannot create, update, or delete posts.
- `author` accounts can manage only their own posts.

### Publish status behavior

- Posts support `published` status:
  - `true`: visible in public blog listing.
  - `false`: treated as draft.
- Draft posts are visible to their owner through `mine=true` and direct post fetch when authenticated.
- Public readers only receive published posts.

## Local Requirements

- AWS SAM CLI (for local backend)
- Docker Desktop (required by SAM local Lambda emulation)
- AWS CLI (recommended for local DynamoDB table setup and required for deployment)
- DynamoDB Local (optional but higly recommended for stable local auth/data)

### Optional: DynamoDB for Local setup

The local in-memory mode is ephemeral. For persistent users/posts during local runs, install DynamoDB Local.

#### Windows

1. Install Java 17+:
   `winget install EclipseAdoptium.Temurin.17.JDK`
2. Download DynamoDB Local:
   `mkdir C:\dynamodb-local`
   `powershell -Command "Invoke-WebRequest https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.tar.gz -OutFile C:\dynamodb-local\dynamodb_local_latest.tar.gz"`
3. Extract and run:
   `tar -xzf C:\dynamodb-local\dynamodb_local_latest.tar.gz -C C:\dynamodb-local`
   `cd C:\dynamodb-local`
   `java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8000`

#### Linux/macOS

1. Install Java 17+.
2. Download and extract DynamoDB Local:
   `mkdir -p ~/dynamodb-local && cd ~/dynamodb-local`
   `curl -L https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.tar.gz -o dynamodb_local_latest.tar.gz`
   `tar -xzf dynamodb_local_latest.tar.gz`
3. Run DynamoDB Local:
   `java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8000`

Verify:
`aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-east-1`

### End of DynamoDB setup


## Create the `.env` file

1. At repository root, copy `.env.example` to `.env`:
   - macOS/Linux: `cp .env.example .env`
   - Windows PowerShell: `Copy-Item .env.example .env`
2. Update values in `.env`:
   - `VITE_API_BASE_URL=/api` for local SAM + Vite proxy
   - `CDK_DEFAULT_ACCOUNT=<your-12-digit-aws-account-id>`
   - `CDK_DEFAULT_REGION=<your-aws-region>` (for example `us-east-1`)
   - `AUTH_SECRET=<strong-random-secret>`
   - `INTERNAL_AI_API_KEY=<internal-llm-provider-key>` (backend-only)
   - `YOU_COM_SEARCH_API_KEY=<internal-you.com-search-key>` (backend-only)
   - `YOU_COM_RESEARCH_MODE=standard` (recommended to control cost)
   - Optional: `PREMIUM_AI_MODEL=<model-name>`
   - Optional: `PREMIUM_AI_SYSTEM_PROMPT=<custom-prompt>`

## Create `packages/backend/env.local.json` for local testing

Before running local SAM commands, create `packages/backend/env.local.json` from the example file:

- macOS/Linux: `cp packages/backend/env.local.json.example packages/backend/env.local.json`
- Windows PowerShell: `Copy-Item packages/backend/env.local.json.example packages/backend/env.local.json`

Then update placeholders in `packages/backend/env.local.json` (for example `AUTH_SECRET`, `INTERNAL_AI_API_KEY`, and `YOU_COM_SEARCH_API_KEY`) with your local values.

## Where to put premium backend keys (local vs AWS Lambda)

This section is specific to premium backend AI mode (`POST /api/posts/premium`).

### Local SAM execution

When running `sam local start-api` with `--env-vars packages/backend/env.local.json`, the Lambda container reads variables from `packages/backend/env.local.json`.

For local premium mode, put these keys in `packages/backend/env.local.json` under `PostsFunction`:

- `INTERNAL_AI_API_KEY`
- `YOU_COM_SEARCH_API_KEY`
- `YOU_COM_RESEARCH_MODE` (recommended: `standard`)
- Optional: `PREMIUM_AI_MODEL`
- Optional: `PREMIUM_AI_SYSTEM_PROMPT`

Example:
`{"PostsFunction":{"LOCAL_DEV":"true","USE_IN_MEMORY_LOCAL":"false","DYNAMODB_ENDPOINT_URL":"http://host.docker.internal:8000","POSTS_TABLE_NAME":"BlogPosts","USERS_TABLE_NAME":"BlogUsers","AUTH_SECRET":"<secret>","INTERNAL_AI_API_KEY":"<gemini-key>","YOU_COM_SEARCH_API_KEY":"<you-key>","YOU_COM_RESEARCH_MODE":"standard","PREMIUM_AI_MODEL":"gemini-2.0-flash","PREMIUM_AI_SYSTEM_PROMPT":""}}`

Important: setting keys only in repository root `.env` does **not** automatically make them available to local SAM unless they are also present in `env.local.json` (or passed through another SAM env-var mechanism).

### Docker in local Mode

Make sure docker is running locally to emulate AWS Lambda with SAM. If you have Docker Desktop, start it before running `pnpm run dev:local:api` or `pnpm run dev:local`.


### AWS Lambda (deployed with CDK)

For deployed AWS Lambda, values are taken from environment variables available to the CDK deploy process and then written into Lambda environment configuration.

In this repo, `packages/infra/lib/blog-platform-stack.ts` sets Lambda env vars from `process.env.*` during `cdk deploy`.

So for AWS deployment:

1. Ensure these are set in the shell environment used to run `pnpm run cdk:deploy` (or present in root `.env` if your shell/process loads it):
   - `INTERNAL_AI_API_KEY`
   - `YOU_COM_SEARCH_API_KEY`
   - `YOU_COM_RESEARCH_MODE=standard`
   - Optional: `PREMIUM_AI_MODEL`
   - Optional: `PREMIUM_AI_SYSTEM_PROMPT`
2. Run deployment: `pnpm run cdk:deploy`

After deploy, those values are stored in Lambda environment variables and used by the backend at runtime.

## AI writing assistance and BYOK security

The app includes AI-aided generation for post drafting and rewriting.

### Premium AI beta mode

- Premium mode complements BYOK mode and does not replace it.
- It runs on the backend using internal keys and a LangChain Gemini LLM flow.
- Research is collected with You.com Research API before writing the draft, then Gemini generates the final markdown post.
- Current route: `POST /api/posts/premium` with `{ "topic": "..." }`.
- The premium system prompt currently uses a placeholder and can be replaced later with `PREMIUM_AI_SYSTEM_PROMPT`.

What premium mode does end-to-end:
1. Validates authenticated user and input topic.
2. Calls You.com Research API to gather research context/sources.
3. Builds a research digest.
4. Calls Gemini to generate a complete markdown draft.
5. Returns `{ markdown, sources }`.

### Premium backend configuration

Premium backend requires both keys:

- `YOU_COM_SEARCH_API_KEY`: used for You.com research calls.
- `INTERNAL_AI_API_KEY`: used for Gemini generation calls.

Use `YOU_COM_RESEARCH_MODE` to control quality/latency/cost:

| Level | Behavior | Typical latency | Price per 1,000 requests |
| --- | --- | --- | --- |
| `lite` | Quick answer with minimal searching | `< 2s` | `$10` |
| `standard` | Balanced speed and depth (default) | `~10–30s` | `$50` |
| `deep` | More searches, deeper cross-referencing | `< 120s` | `$100` |
| `exhaustive` | Maximum thoroughness | `< 300s` | `$300` |

Set these backend env vars:

- `YOU_COM_SEARCH_API_KEY=<you.com-research-api-key>`
- `INTERNAL_AI_API_KEY=<gemini-api-key>`
- `YOU_COM_RESEARCH_MODE=standard` (or `lite`, `deep`, `exhaustive`)
- Optional: `PREMIUM_AI_MODEL=gemini-2.5-flash`
- Optional: `PREMIUM_AI_SYSTEM_PROMPT=<custom-prompt>`

Where to set them:

- Local SAM: `packages/backend/env.local.json` under `PostsFunction`.
- Deployed AWS Lambda (CDK): set environment values before `pnpm run cdk:deploy` so they are injected into Lambda.

### Bring Your Own Key (BYOK)

- You use your own provider API key.
- Keys are stored on your local device (browser local storage).
- Keys are never sent to or persisted on this backend.
- AI requests are made directly from the frontend to the selected provider API.

### Supported providers

- OpenAI (ChatGPT)
- Google Gemini
- Anthropic Claude

### How to get your API key

#### OpenAI (ChatGPT)

1. Sign in at `https://platform.openai.com/`.
2. Open API key management:
   `https://platform.openai.com/api-keys`
3. Click **Create new secret key**.
4. Copy the key immediately (it is shown once).
5. In the app, go to **Preferences** and paste it into the ChatGPT API key field.

#### Google Gemini

1. Sign in at `https://aistudio.google.com/`.
2. Open API keys:
   `https://aistudio.google.com/app/apikey`
3. Create a new API key for your project.
4. Copy the key.
5. In the app, go to **Preferences** and paste it into the Gemini API key field.

#### Anthropic

1. Sign in at `https://console.anthropic.com/`.
2. Open API keys in the Anthropic Console.
3. Create a new API key.
4. Copy the key.
5. In the app, go to **Preferences** and paste it into the Anthropic API key field.

### Using AI in the app

1. Open **Preferences**.
2. Select your provider (`Gemini`, `ChatGPT`, or `Anthropic`).
3. Paste your provider API key.
4. Choose a model and optional generation settings.
5. Save and use AI actions while writing posts.

Security note: If you clear browser storage or switch devices/browsers, you must re-enter your key.

## Run locally (step-by-step)

1. Install dependencies:
   `pnpm install`
2. Ensure `.env` is created (section above).
3. Start backend + frontend together:
   `pnpm run dev:local`
4. Open the frontend URL shown by Vite (usually `http://localhost:5173`).

### Optional: run local backend with DynamoDB Local

1. Start DynamoDB Local on port `8000`.
2. Create local tables (run once):
   `aws dynamodb create-table --table-name BlogUsers --attribute-definitions AttributeName=username,AttributeType=S --key-schema AttributeName=username,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --region us-east-1`
   `aws dynamodb create-table --table-name BlogPosts --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --region us-east-1`
3. Create `packages/backend/env.local.json`:
   `{"PostsFunction":{"LOCAL_DEV":"true","USE_IN_MEMORY_LOCAL":"false","DYNAMODB_ENDPOINT_URL":"http://host.docker.internal:8000","POSTS_TABLE_NAME":"BlogPosts","USERS_TABLE_NAME":"BlogUsers","AUTH_SECRET":"replace-with-a-strong-random-secret"}}`
4. Run with local backend overrides:
   `pnpm run dev:local`

## Backend deployment (AWS Lambda + API Gateway)

1. Configure AWS credentials:
   `aws configure`
2. Install dependencies:
   `pnpm install`
3. Confirm `.env` contains `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION`.
4. Bootstrap CDK (first deploy per account/region):
   `pnpm --filter @serverless-blog/infra cdk bootstrap`
5. Deploy the stack:
   `pnpm run cdk:deploy`
6. Copy `ApiBaseUrl` from deploy output into `.env`:
   `VITE_API_BASE_URL=<ApiBaseUrl without trailing slash>`
7. Verify backend endpoint:
   `curl <ApiBaseUrl>api/posts?page=1&limit=5`
8. Optional auth smoke test:
   - Register author: `curl -X POST <ApiBaseUrl>api/register -H "Content-Type: application/json" -d "{\"email\":\"author@example.com\",\"password\":\"password123\",\"role\":\"author\"}"`
   - Login: `curl -X POST <ApiBaseUrl>api/login -H "Content-Type: application/json" -d "{\"email\":\"author@example.com\",\"password\":\"password123\"}"`

This deploys the backend API to AWS Lambda behind API Gateway with DynamoDB tables created by CDK.

## Frontend deployment (web app)

1. Ensure `.env` uses deployed API URL:
   `VITE_API_BASE_URL=<ApiBaseUrl without trailing slash>`
2. Build frontend:
   `pnpm run build:web`
3. Deploy `apps/web/dist` to your static host (for example S3 + CloudFront, Netlify, or Vercel).
4. Verify list/create/update flows from the deployed site.

Example AWS static hosting flow (S3 + CloudFront):
1. Create an S3 bucket for static hosting and a CloudFront distribution.
2. Upload build output:
   `aws s3 sync apps/web/dist s3://<your-bucket-name> --delete`
3. (Optional) Invalidate CloudFront cache after updates:
   `aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"`

## Before submitting

- Type checking: `pnpm -r exec tsc --noEmit`
- Linting (frontend source): `pnpm --filter @serverless-blog/web exec eslint --fix src`
- Tests: `pnpm test`
- Frontend production build: `pnpm --filter @serverless-blog/web build`
- Infra synthesis (when infra changes): `pnpm --filter @serverless-blog/infra cdk synth`

## Monorepo packages

- `apps/web`: React + TypeScript + Vite frontend
- `packages/backend`: TypeScript Node.js Lambda handlers and tests
- `packages/infra`: AWS CDK infrastructure stack


## Extra information on the project
## NPM scripts reference (`package.json`)

All commands below are run from the repository root.

### `pnpm run build`

- **What it does:** Runs the root `build` script, which delegates to `build:web`.
- **Underlying command:** `pnpm run build:web`
- **Parameters explained:**
  - No extra parameters in this script.

### `pnpm run dev`

- **What it does:** Runs the root development script for the frontend only.
- **Underlying command:** `pnpm run dev:web`
- **Parameters explained:**
  - No extra parameters in this script.

### `pnpm run test`

- **What it does:** Runs all repository tests: frontend tests (if configured) and backend tests.
- **Underlying command:** `pnpm run test:web && pnpm run test:backend`
- **Parameters explained:**
  - `&&`: Runs backend tests only after the frontend test command completes successfully.

### `pnpm run test:web`

- **What it does:** Runs frontend tests in the web workspace when a test script exists.
- **Underlying command:** `pnpm --filter @serverless-blog/web run test --if-present`
- **Parameters explained:**
  - `--filter @serverless-blog/web`: Targets only the frontend workspace package.
  - `run --if-present test`: Executes the `test` script only if it is defined.

### `pnpm run test:backend`

- **What it does:** Runs backend TypeScript unit tests.
- **Underlying command:** `pnpm --filter @serverless-blog/backend test`
- **Parameters explained:**
  - `--filter @serverless-blog/backend`: Targets only the backend workspace package.
  - `test`: Runs backend `vitest` unit tests.

### `pnpm run build:backend`

- **What it does:** Compiles backend TypeScript Lambda code to `dist`.
- **Underlying command:** `pnpm --filter @serverless-blog/backend build`
- **Parameters explained:**
  - `--filter @serverless-blog/backend`: Targets only the backend workspace package.
  - `build`: Runs backend `tsc` build.

### `pnpm run dev:web`

- **What it does:** Starts the Vite dev server for the web app package.
- **Underlying command:** `pnpm --filter @serverless-blog/web dev`
- **Parameters explained:**
  - `--filter @serverless-blog/web`: Tells `pnpm` to run the command only in the `@serverless-blog/web` workspace package.
  - `dev`: Runs that package's own `dev` script.

### `pnpm run dev:api`

- **What it does:** Starts AWS SAM local API for the backend Lambda using default template settings.
- **Underlying command:** `pnpm run build:backend && sam local start-api -t packages/backend/template.yaml --port 3000`
- **Parameters explained:**
  - `pnpm run build:backend`: Builds backend code before SAM starts.
  - `local start-api`: Runs API Gateway + Lambda locally.
  - `-t packages/backend/template.yaml`: Points SAM to the backend infrastructure template file.
  - `--port 3000`: Exposes the local API on port `3000`.

### `pnpm run dev:local:api`

- **What it does:** Starts AWS SAM local API with local environment variable overrides.
- **Underlying command:** `pnpm run build:backend && sam local start-api -t packages/backend/template.yaml --port 3000 --env-vars packages/backend/env.local.json`
- **Parameters explained:**
  - `pnpm run build:backend`: Builds backend code before SAM starts.
  - `local start-api`: Runs API Gateway + Lambda locally.
  - `-t packages/backend/template.yaml`: Uses the backend SAM template.
  - `--port 3000`: Uses local port `3000`.
  - `--env-vars packages/backend/env.local.json`: Loads Lambda environment variables from `env.local.json` (for local-only settings such as `LOCAL_DEV`, table names, and secrets).

### `pnpm run dev:local:web`

- **What it does:** Alias for running frontend dev locally.
- **Underlying command:** `pnpm run dev:web`
- **Parameters explained:**
  - No extra parameters in this script.

### `pnpm run dev:local`

- **What it does:** Runs local backend and frontend in parallel in a single command.
- **Underlying command:** `pnpm dlx concurrently -k -n api,web -c yellow,cyan "pnpm run dev:local:api" "pnpm run dev:local:web"`
- **Parameters explained:**
  - `pnpm dlx concurrently`: Executes the `concurrently` CLI without permanently adding it to dependencies.
  - `-k`: If one process exits/fails, terminate the other process.
  - `-n api,web`: Labels process output streams as `api` and `web`.
  - `-c yellow,cyan`: Sets output label colors (`api` in yellow, `web` in cyan).
  - `"pnpm run dev:local:api"`: First process (SAM local backend).
  - `"pnpm run dev:local:web"`: Second process (frontend Vite dev server).

### `pnpm run build:web`

- **What it does:** Builds the frontend app for production.
- **Underlying command:** `pnpm --filter @serverless-blog/web build`
- **Parameters explained:**
  - `--filter @serverless-blog/web`: Targets only the frontend workspace package.
  - `build`: Runs that package's production build script.

### `pnpm run lint:web`

- **What it does:** Runs frontend lint checks.
- **Underlying command:** `pnpm --filter @serverless-blog/web lint`
- **Parameters explained:**
  - `--filter @serverless-blog/web`: Runs only in the frontend package.
  - `lint`: Executes that package's lint script.

### `pnpm run cdk:synth`

- **What it does:** Synthesizes AWS CDK templates (preview CloudFormation output).
- **Underlying command:** `pnpm --filter @serverless-blog/infra cdk synth`
- **Parameters explained:**
  - `--filter @serverless-blog/infra`: Runs command only in the infrastructure package.
  - `cdk synth`: Generates CloudFormation from CDK code without deploying.

### `pnpm run cdk:deploy`

- **What it does:** Deploys CDK stack(s) to AWS.
- **Underlying command:** `pnpm --filter @serverless-blog/infra cdk deploy`
- **Parameters explained:**
  - `--filter @serverless-blog/infra`: Executes in the infra package.
  - `cdk deploy`: Builds and deploys CloudFormation changes to AWS.

### `pnpm run cdk:destroy`

- **What it does:** Destroys deployed CDK stack(s) in AWS.
- **Underlying command:** `pnpm --filter @serverless-blog/infra cdk destroy`
- **Parameters explained:**
  - `--filter @serverless-blog/infra`: Executes in the infra package.
  - `cdk destroy`: Deletes provisioned CloudFormation stack resources.

## API contract

- `GET /api/posts` (public, paginated)
  - Query params: `page` (>=1), `limit` (>=1, max 50)
  - Response shape:
    - `items`: array of posts for current page
      - each item includes: `id`, `title`, `content`, `createdAt`, `author`
      - `content` is truncated to a maximum of 200 characters for list views
    - `pagination`: `{ page, limit, totalItems, totalPages }`
- `GET /api/posts/{id}` (public)
  - Returns a single post with full `content`
  - Response includes: `id`, `title`, `content`, `createdAt`, `author`
- `GET /api/posts?id={id}` (public, compatibility fallback)
  - Returns a single post with full `content`
  - Useful when an environment has not yet deployed the `/api/posts/{id}` API Gateway route
- `POST /api/posts` (authentication required)

## Troubleshooting

- `Missing VITE_API_BASE_URL`: ensure `.env` exists and includes `VITE_API_BASE_URL`.
- `pnpm run dev:api` or `pnpm run dev:local:api` fails: verify AWS SAM CLI is installed and in `PATH`.
- SAM Docker error: start Docker Desktop and retry.
- `pnpm run cdk:deploy` fails: verify AWS credentials and `CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION`.

## System checks:

- pnpm install
- pnpm -r exec tsc --noEmit
- pnpm --filter @serverless-blog/web exec eslint --fix src
- pnpm test
- pnpm --filter @serverless-blog/web build
- pnpm --filter @serverless-blog/infra cdk synth