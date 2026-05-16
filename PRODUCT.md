# Exploited Product Context

## Register
product

## Product Purpose
Exploited helps investigators, advocates, compliance teams, and hackathon judges turn a company or country-region query into a cited exploitation-risk report. The first demo must prove the loop: enter a target, generate an evidence-backed report, inspect source signals on a globe, and produce a formal complaint letter PDF.

## Users
- NGO or labor-rights researchers who need fast first-pass triage.
- Corporate compliance reviewers who need cited supplier and jurisdiction signals.
- Hackathon judges evaluating whether the product compresses manual investigation work into minutes.

## MVP Scope
- Two input modes: company name and geographical region.
- Demo queries: Shein and Cambodia garment sector.
- Dashboard report with severity, credibility, citations, source status, and map points.
- D3 SVG orthographic globe, not Three.js.
- One-click complaint-letter PDF generated from report evidence.
- Explicit demo fixtures gated by `NEXT_PUBLIC_DEMO_MODE=true`.

## Out Of Scope For V0
- Live Snowflake ingestion.
- ElevenLabs conversational agent.
- Trained ML classifier pipeline.
- Live scraping of all data sources.
- Final brand/frontend polish.

## Source Principles
- The Google Doc spec is authoritative for product behavior.
- Demo data is allowed only as a labeled demo mode, not as a silent production fallback.
- Missing API keys, Supabase config, or source access must fail clearly.
