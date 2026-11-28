# CHALLENGE — Testing & CI/CD Guide

## Local & Codespaces Checks
- Typecheck: `npm run typecheck`
- Business & security rules: `npm run test:rules`
- Playwright E2E smoke & runtime tests: `npm run test:e2e`
- Dependency audit: `npm audit --audit-level=high`

## Environment & Data Safety
- Never commit real secrets or `.env*` files (except `.env.example` and `.env.test.example`).
- Test artifacts (`test-results/`, `playwright-report/`) and `.vercel` are ignored via `.gitignore`.
