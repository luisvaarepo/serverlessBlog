# Publish Backend and Frontend from GitHub to AWS

This document explains how to deploy both parts of this monorepo from GitHub:
- Backend (`packages/backend` + `packages/infra`) to AWS Lambda/API Gateway/DynamoDB using CDK
- Frontend (`apps/web`) to S3 + CloudFront

## 1) One-time AWS setup

1. Create an IAM role for GitHub Actions using OIDC federation.
2. Grant this role permissions for:
   - CDK/CloudFormation deployment
   - Lambda, API Gateway, DynamoDB, IAM pass-role
   - S3 upload and CloudFront invalidation
3. Bootstrap CDK in your target account/region (first time only):
   - `pnpm --filter @serverless-blog/infra cdk bootstrap`

## 2) GitHub repository secrets

Add these repository secrets in GitHub:
- `AWS_ROLE_ARN`
- `AWS_REGION`
- `CDK_STACK_NAME`
- `WEB_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`

## 3) CI/CD workflow file

Create `.github/workflows/deploy-aws.yml` with a two-job pipeline:
- `deploy-backend`
  - Checkout
  - Setup Node + pnpm
  - Configure AWS credentials (OIDC role)
  - Install deps
  - Run backend tests
  - Run `pnpm run cdk:deploy -- --require-approval never`
  - Read `ApiBaseUrl` from CloudFormation outputs
- `deploy-frontend`
  - Depends on backend job
  - Build frontend using `VITE_API_BASE_URL=<ApiBaseUrl>`
  - Upload `apps/web/dist` to S3
  - Invalidate CloudFront cache

Example workflow:

```yaml
name: Deploy backend + frontend to AWS

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    outputs:
      api_base_url: ${{ steps.stack-output.outputs.api_base_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run backend tests
        run: pnpm --filter @serverless-blog/backend test

      - name: Deploy CDK stack
        run: pnpm run cdk:deploy -- --require-approval never

      - name: Read ApiBaseUrl from CloudFormation
        id: stack-output
        run: |
          API_BASE_URL=$(aws cloudformation describe-stacks \
            --stack-name "${{ secrets.CDK_STACK_NAME }}" \
            --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
            --output text)
          echo "api_base_url=${API_BASE_URL%/}" >> "$GITHUB_OUTPUT"

  deploy-frontend:
    runs-on: ubuntu-latest
    needs: deploy-backend
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend with deployed API URL
        env:
          VITE_API_BASE_URL: ${{ needs.deploy-backend.outputs.api_base_url }}
        run: pnpm run build:web

      - name: Upload frontend to S3
        run: aws s3 sync apps/web/dist s3://${{ secrets.WEB_BUCKET }} --delete

      - name: Invalidate CloudFront cache
        run: aws cloudfront create-invalidation --distribution-id "${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}" --paths "/*"
```

## 4) Notes

- Keep deployment on `main` branch only (or change branch rule as needed).
- If your stack name differs by environment, use environment-specific secrets.
- Ensure `ApiBaseUrl` exists in CDK stack outputs.
- Frontend should always be built with the deployed API URL to avoid local endpoint mismatches.
