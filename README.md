# UnExploited

UnExploited is an Uncommon Hacks MVP for turning a company or geographic-region query into an evidence-backed labor exploitation risk report.

The current `main` implementation has two operating modes:

- **Demo mode** (`NEXT_PUBLIC_DEMO_MODE=true`): uses labeled fixture reports for the Shein company brief and Cambodia garment-sector region brief.
- **Live swarm mode** (`NEXT_PUBLIC_DEMO_MODE` not set to `true`): creates a Supabase report shell, runs a LangGraph agent swarm, streams agent progress to `/swarm/[id]`, then redirects to the persisted dashboard.

## Current Product Surface

- Landing page with company and region inputs, demo links, and live-mode onboarding fields for industry, countries, time window, reporter persona, and output goal.
- Dedicated `/swarm/[id]` launch page with server-sent events, a 3D swarm constellation, specialist-agent progress, synthesis scores, and automatic dashboard redirect.
- `/dashboard` report workspace with risk scores, source statuses, cited findings, an interactive Three.js globe, recommended action, and PDF generation.
- Report-aware ElevenLabs voice-agent panel that sends the active dashboard report as conversational context when configured.
- Complaint PDF endpoint at `/api/reports/[id]/complaint.pdf`.
- Supabase schema for reports, findings, citations, map points, source status, onboarding answers, source cache, feature bundles, and report lifecycle status.

## Agent Swarm

Live mode runs five specialist agents:

- News intelligence: Google News RSS with optional GDELT enrichment.
- Watchlist matches: UFLPA Entity List and OFAC SDN checks.
- Supplier disclosure: Wikidata plus curated supplier-registry snapshots.
- Legal and complaints: CourtListener plus ILO NORMLEX complaint context.
- Country risk index: Walk Free Global Slavery Index country scores.

Each agent extracts cited findings with OpenAI structured output, persists source status and evidence, and contributes features to the final synthesis.

## Run Locally

```bash
pnpm install
pnpm dev
```

The checked-in `.env.example` defaults to demo mode:

```bash
NEXT_PUBLIC_DEMO_MODE=true
```

For live swarm mode, create `.env.local` with at least:

```bash
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
OPENAI_API_KEY=
```

Optional live integrations:

```bash
OPENAI_EXTRACTION_MODEL=
OPENAI_SYNTHESIS_MODEL=
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
COURTLISTENER_API_TOKEN=
```

## Useful Commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

## Routes And APIs

- `/` - landing and onboarding.
- `/swarm/[id]` - live agent launch/progress page.
- `/dashboard?mode=company&query=Shein` - demo dashboard by query.
- `/dashboard?id=<reportId>` - persisted live report dashboard.
- `POST /api/onboarding` - validate onboarding, create a report shell, and start the swarm in live mode.
- `POST /api/reports` - return a demo fixture or existing Supabase report for an input query.
- `GET /api/reports/[id]` - load a report by id.
- `GET /api/reports/stream?id=<reportId>` - stream swarm progress over SSE.
- `GET /api/reports/[id]/complaint.pdf` - generate a complaint letter PDF.
- `POST /api/voice/signed-url` - create an ElevenLabs signed conversation URL.
- `POST /api/agents/test` - run one specialist agent against an existing report shell.

## Current Gaps

- Branding is mixed: the landing page uses `LUMINA`, while metadata, dashboard, and product docs use `UnExploited`.
- The benchmark panel is still a placeholder; a real NGO report has not been selected or embedded.
- Snowflake is a product/track plan only; the current implementation uses Supabase/Postgres and local/source-cache paths.
- Demo fixtures are labeled and useful for the hackathon flow, but they are not live source refreshes.
