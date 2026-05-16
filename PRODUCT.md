# Exploited Product Context

## Register
product

## Source Of Truth
The Google Doc `ExploitedSpecs` is authoritative for product direction. This file is the repo-local operating summary for implementation, design, and demo planning. When the Google Doc changes, update this file before making product or frontend decisions.

## Product Purpose
Exploited helps investigators, advocates, compliance teams, and hackathon judges turn a company or geographic-region query into a cited exploitation-risk report. The demo must prove a compact loop: enter a target, generate an evidence-backed report, inspect geographic/source signals, compare against a real NGO-style reference, and produce a formal complaint or compliance letter PDF.

The pitch claim is acceleration: compressing work that normally takes weeks of human investigation into minutes of guided synthesis. The product should not pretend to be a final legal or investigative authority; it should make source-backed triage faster, more actionable, and easier to explain.

## Users
- NGO and labor-rights researchers who need fast first-pass triage.
- Corporate compliance reviewers who need cited supplier and jurisdiction signals.
- Advocacy teams that need a sendable complaint or compliance letter from findings.
- Hackathon judges evaluating whether the product turns messy data into an impressive, useful demo.

## Core Demo Flow
1. User chooses an input mode.
2. User enters a company name or geographic region.
3. Agents/data layer generate a cited exploitation-risk report.
4. Dashboard shows severity, credibility, source status, and geographic signal pins.
5. User clicks to generate a formal complaint or corporate compliance letter PDF.
6. Demo shows the output side by side with one real NGO investigative report.
7. If available, user can discuss the report with an ElevenLabs conversational voice agent.

## Input Strategy
Build the architecture to be input-agnostic, but demo only two modes in the hackathon version:
- Company name, the original lookup path.
- Geographic region, for example Cambodia garment sector.

Do not build demographic or economic modes for v0. They can be pitched as extensible axes because the basic architecture should not be company-specific.

## MVP Scope
- Next.js + Tailwind frontend with minimal product UI.
- Company and geographic-region input modes.
- Demo paths for a recognizable company, likely Shein, and a country-sector query, likely Cambodia garment sector.
- Dashboard report with severity, credibility, citations, source status, map points, and recommendation.
- D3 SVG orthographic globe with interactive-looking pins. Use D3/SVG, not Three.js, for the globe.
- One-click formal complaint or corporate compliance letter PDF generated from report evidence.
- Explicit demo fixtures gated by `NEXT_PUBLIC_DEMO_MODE=true` until live data is seeded.
- Clear failure states for missing keys, failed source calls, Supabase errors, or unavailable data.

## Impressive Feature Layer
The primary impressive feature is the auto-generated formal complaint letter PDF.

The letter should be:
- Generated after the report is produced.
- Formatted as either a labor-authority complaint or a corporate compliance letter.
- Jurisdiction-aware when data supports it, such as US DOL, UK GLAA, ILO NORMLEX, or a company ESG/compliance contact.
- Pre-filled with the agent findings and citations.
- Previewable or downloadable in the demo.

Backup feature if there is time: real-time monitoring. A user subscribes to a company, scheduled agents rerun, and alerts are sent by email or SMS when new findings appear.

## Data And Source Plan
The product should verify and eventually ingest these sources:

| Source | Access | Pre-hackathon task |
| --- | --- | --- |
| UFLPA Entity List | CBP website, PDF/CSV | Download and parse to JSON |
| Open Supply Hub | REST API, free with key | Register and test endpoints |
| Global Slavery Index | Walk Free, downloadable | Download country scores |
| ILO NORMLEX | Web, no clean API | Scrape complaint list once |
| GDELT | BigQuery + DOC 2.0 API | Test event query for labor themes |
| CourtListener | REST API, free with key | Register and test FLSA search |

If a live source is flaky, use a cached snapshot loaded into the warehouse rather than losing hackathon time debugging auth. Cached snapshots must be labeled as snapshots and never disguised as live refreshes.

## Snowflake Role
Snowflake is useful for both the sponsor track and real product architecture:
- Store scraped historical labor violation cases as labeled training data.
- Ingest Open Supply Hub and UFLPA data so demo agents can query preloaded data quickly.
- Power an analytical dashboard for country, industry, and violation trends over time.

Honest framing: Snowflake is partly a sponsor-track choice, but it legitimately improves demo latency and enables a credible analytics view.

## ML Plan
Use sentence-transformer embeddings with a small trained classifier head, not full end-to-end transformer fine-tuning.

Recommended pipeline:
- Finding text.
- `all-MiniLM-L6-v2` embedding, 384 dimensions.
- XGBoost or logistic-regression classifier head.
- Outputs: severity 1-5 and credibility 1-5.

Reasons:
- Training takes minutes, not hours.
- Works with hundreds of labeled examples.
- Avoids GPU, memory, and long fine-tuning risks.
- Still counts as trained because the classifier head learns real weights.

Training data target: 300-500 labeled findings from public NGO reports and similar ground truth. Use labels for severity and credibility.

## ElevenLabs Role
Use ElevenLabs Conversational AI if time allows. The strongest flow is not simple narration; it is a report-aware voice agent.

Demo flow:
- Report is generated for a company such as Shein.
- User clicks `Discuss this report`.
- Voice agent has the report as context.
- User asks spoken follow-up questions, such as which supplier is highest priority or what evidence supports a particular facility.
- Agent answers in voice and can call the backend to re-query data if needed.

## Benchmarking And Demo Proof
Do not build a formal academic benchmark for v0. No F1 score, held-out test set, or statistical comparison is required.

Do include one real NGO investigative report in the demo. The side-by-side comparison is necessary because the acceleration claim needs a human-produced reference. Use a public Verite, WRC, or FLA-style report, show its title and date, and place it beside the generated report so judges can see structural similarity.

## Tech Stack
- Frontend: Next.js + Tailwind.
- Globe: D3 orthographic projection rendered as SVG.
- Backend/data app: Supabase/Postgres for app records and report persistence.
- Warehouse/analytics: Snowflake for preloaded source data, training records, and trend analysis.
- PDF generation: template + generated report content.
- Voice: ElevenLabs Conversational AI when time allows.

## Open Decisions
- Final project name.
- Which NGO report to show as the side-by-side benchmark.
- Which company to use for the main company demo, with Shein, Nike, and Apple as candidates.
- Who owns demo PM work for benchmark setup and rehearsal.
- Which live data sources are reliable enough for the hackathon demo versus cached snapshots.

## Out Of Scope For V0
- Demographic and economic input modes.
- Formal academic benchmarking.
- Full live scraping for every source.
- End-to-end DistilBERT or larger transformer fine-tuning.
- Production-grade monitoring subscriptions unless the core flow is already stable.
- Final frontend polish and brand design.

## Product Principles
- Prioritize a believable, source-backed demo loop over broad feature count.
- Make source status visible. Ready, snapshot, pending, and blocked states should be explicit.
- Demo data is allowed only as labeled demo mode, not as a silent fallback.
- Missing API keys, Supabase config, model calls, source refreshes, or backend failures must fail clearly.
- The report must produce an action, not just a risk score.
- Keep the architecture extensible to more input axes, sources, and scoring models without overbuilding them in v0.
