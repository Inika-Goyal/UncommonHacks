# Exploited

Bare-bones Uncommon Hacks MVP for evidence-backed exploitation reports.

## Run locally

```bash
pnpm install
pnpm dev
```

The local workspace includes `.env.local` with `NEXT_PUBLIC_DEMO_MODE=true`, so the app uses labeled demo fixtures. Production mode should provide `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`; otherwise report generation fails clearly.

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```
