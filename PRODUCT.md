# LaborLens Product Context

## Register

product

## Source Of Truth

The Google Doc `ExploitedSpecs` is authoritative for product direction. This file is the repo-local operating summary for implementation, design, and demo planning. When the Google Doc changes, update this file before making product or frontend decisions.

The product name across repo metadata, landing page, and dashboard UI is **LaborLens**.

## Product Purpose

LaborLens helps investigators, advocates, compliance teams, and hackathon judges turn a company or geographic-region query into a cited exploitation-risk report. The demo proves a compact loop: enter a target, launch a specialist agent swarm, watch evidence collection progress, inspect the generated risk dashboard, and produce a formal complaint or compliance letter PDF.

The pitch claim is acceleration: compressing work that normally takes weeks of human investigation into minutes of guided synthesis. The product should not pretend to be a final legal or investigative authority; it should make source-backed triage faster, more actionable, and easier to explain.

## Users

- NGO and labor-rights researchers who need fast first-pass triage.
- Corporate compliance reviewers who need cited supplier and jurisdiction signals.
- Advocacy teams that need a sendable complaint or compliance letter from findings.
- Hackathon judges evaluating whether the product turns messy data into an impressive, useful demo.

## Current Demo Flow

1. User opens the landing page and chooses company or region mode.
2. In demo mode, the user can open the labeled Shein or Cambodia fixture dashboard directly.
3. In live mode, the user enters a query plus optional onboarding fields: industry, countries to weight, time window, reporter persona, and output goal.
4. `POST /api/onboarding` validates the input, creates a Supabase report shell, and starts the LangGraph swarm after the response.
5. `/swarm/[id]` streams progress from seven specialist agents and shows synthesis scores when complete.
6. The app redirects to `/dashboard?id=<reportId>`.
7. Dashboard shows severity, credibility, overall risk, source status, cited findings, an interactive signal globe, recommendation, PDF generation, and the report-aware ElevenLabs panel if configured.

## MVP Scope Implemented On Main

- Next.js 16 + React 19 + Tailwind v4 app.
- Company and region input modes.
- Labeled demo fixtures for Shein and Cambodia garment sector.
- Live Supabase-backed report persistence.
- LangGraph agent swarm with seven specialist agents:
  - News intelligence.
  - Watchlist matches.
  - Supplier disclosure.
  - Web supply-chain research.
  - Pipeline mapping.
  - Legal and complaints.
  - Country risk index.
- Server-sent-event progress stream for `/swarm/[id]`.
- 3D swarm constellation with WebGL fallback.
- Dashboard report with severity, credibility, overall risk, citations, source status, map points, explicit map arcs, recommendation, and source note.
- Evidence-backed representative supply-chain graph composition across raw inputs, processing, assembly, transit, distribution, and markets.
- Interactive Three.js globe using Natural Earth 110m country polygons.
- Complaint PDF generated from report evidence.
- Source cache and feature-bundle persistence for live runs.
- ElevenLabs signed-url endpoint and dashboard voice panel.
- Clear configuration errors for missing Supabase, OpenAI, or ElevenLabs credentials.

## Demo Mode

Demo mode is controlled by `NEXT_PUBLIC_DEMO_MODE=true`.

Demo mode uses labeled fixture evidence only. It is intentionally not a silent live-data fallback. The two built-in fixtures are:

- Shein company brief.
- Cambodia garment-sector region brief.

In demo mode, `/api/onboarding` returns a `DEMO_MODE` error because live swarm runs are disabled. Query-based dashboards use `/api/reports` and the fixture set.

## Live Mode

Live mode requires Supabase and OpenAI configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Optional credentials:

- `OPENAI_EXTRACTION_MODEL`, default `gpt-4o-mini`.
- `OPENAI_SYNTHESIS_MODEL`, default `gpt-4o`.
- `COURTLISTENER_API_TOKEN`.
- `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`.

The live pipeline creates a report shell, inserts onboarding answers and initial source statuses, runs the specialist nodes, stores findings/citations/map points/map arcs/source statuses, builds a feature bundle, synthesizes a final report, and marks the report ready.

## Data And Source Plan

| Source | Current implementation | Status |
| --- | --- | --- |
| Google News RSS | Live public RSS lookup with cache | Implemented |
| Public web research | No-key bounded search, page parsing, and cited graph extraction | Implemented |
| GDELT | Optional news enrichment | Implemented as best effort |
| UFLPA Entity List | DHS page parse with embedded fallback rows | Implemented |
| OFAC SDN | Public CSV lookup | Implemented |
| Wikidata | SPARQL corporate-footprint lookup | Implemented |
| Supplier registry | Curated local snapshot keyed by known demo targets | Implemented |
| Global Slavery Index | Local country-score data and lookup | Implemented |
| ILO NORMLEX | Local complaint snapshot with authoritative URLs | Implemented |
| CourtListener | API lookup, optionally token-backed | Implemented |
| Open Supply Hub | Represented through fixture/supplier links, not a live API client | Not live |
| Snowflake | Product/track plan only | Not implemented |

Cached snapshots must remain labeled as snapshots or cache-derived evidence. They should never be disguised as live refreshes.

## Impressive Feature Layer

The strongest implemented feature layer is the live agent-swarm launch plus generated formal complaint PDF:

- The launch page makes the hidden data pipeline visible.
- The dashboard keeps evidence, citations, geography, and source status inspectable.
- The PDF turns the report into an action artifact rather than just a risk score.

The ElevenLabs report control is implemented in the dashboard header, but it depends on external agent configuration and microphone/browser permissions. Configure these case-sensitive ElevenLabs Client tools to match the React registration:

| Tool | Parameters | Purpose |
| --- | --- | --- |
| `highlightFinding` | `findingId` string | Scroll to and highlight cited evidence. |
| `focusMapPoint` | `pointId` string | Focus the globe on a mapped signal. |
| `scrollToDashboardSection` | `section`: `summary`, `map`, `sources`, `findings`, or `action` | Navigate the report workspace. |
| `openComplaintLetter` | none | Open the complaint/compliance PDF route. |

## Benchmarking And Demo Proof

Do not build a formal academic benchmark for v0. No F1 score, held-out test set, or statistical comparison is required.

The dashboard still needs one real NGO investigative report as a side-by-side comparison target. Use a public Verite, WRC, FLA, or similar report, show title and date, and place it beside the generated report so judges can see structural similarity. This remains a demo-content gap.

## Tech Stack

- Frontend: Next.js 16, React 19, Tailwind v4, motion, lucide-react.
- 3D: Three.js, React Three Fiber, Drei, postprocessing, Natural Earth GeoJSON.
- Agent orchestration: LangGraph and LangChain.
- LLMs: OpenAI structured output for finding extraction and synthesis.
- Persistence: Supabase/Postgres.
- PDF generation: `@react-pdf/renderer`.
- Voice: ElevenLabs Conversational AI.
- Tests: Playwright, ESLint, TypeScript.

## Open Decisions

- Which NGO report to use for the benchmark panel.
- Which live demo target is safest for the main presentation.
- Whether Snowflake should be implemented or only discussed as sponsor-track architecture.
- How much of Open Supply Hub should be live versus represented through curated supplier snapshots.
- Whether the landing page should keep the immersive glass/video aesthetic or align with the more utilitarian dashboard.

## Out Of Scope For V0

- Demographic and economic input modes.
- Formal academic benchmarking.
- Unbounded live scraping for every source.
- Exact physical shipment tracing from a specific mine or factory to a specific retail destination.
- End-to-end DistilBERT or larger transformer fine-tuning.
- Production-grade monitoring subscriptions.
- Silent substitution of fixture data when live sources fail.

## Product Principles

- Prioritize a believable, source-backed demo loop over broad feature count.
- Make source status visible. Ready, snapshot, pending, and blocked states should be explicit in data, even if the user-facing label simplifies snapshot to live.
- Demo data is allowed only as labeled demo mode.
- Missing API keys, Supabase config, model calls, source refreshes, or backend failures must fail clearly.
- The report must produce an action, not just a risk score.
- Keep the architecture extensible to more input axes, sources, and scoring models without overbuilding them in v0.
