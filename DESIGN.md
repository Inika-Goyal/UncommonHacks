# LaborLens Design Context

## Design Register

Product UI. The current `main` branch has moved beyond the original minimal dashboard-only direction and now contains three distinct visual surfaces: a LaborLens-branded landing page, a cinematic swarm launch page, and the LaborLens report dashboard.

## Scene

A hackathon judge or teammate is using a laptop in normal indoor lighting and needs to understand the product quickly: what target is being investigated, which agents are working, what evidence was found, and what action artifact can be generated.

## Current Surfaces

### Landing Page

- Uses `LaborLens` branding, an immersive video background, liquid-glass panels, animated entry states, and a footer with placeholder navigation links.
- Supports company and region modes.
- In demo mode, shows only the core query controls and links to the Shein and Cambodia demo dashboards.
- In live mode, reveals onboarding controls for industry, time window, country weighting, reporter persona, and output goal.

### Swarm Launch Page

- Route: `/swarm/[id]`.
- Shows live agent status from server-sent events.
- Uses a dark, cinematic backdrop, aurora-style light fields, progress bar, event log, score tiles, and a Three.js constellation.
- Has WebGL fallback states so the page remains usable if 3D rendering is unavailable.
- Redirects to the dashboard after the run completes.

### Report Dashboard

- Uses `LaborLens` branding.
- Prioritizes dense report review: left control panel, report header, score blocks, globe, source status list, evidence table, recommendation panel, PDF actions, and ElevenLabs voice panel.
- The globe is interactive and includes country polygons, signal pins, animated arcs, zoom/pan/reset controls, legend rows, and an optional demo network toggle.
- Source statuses render as user-facing live/pending/blocked states while preserving snapshot/cache distinctions in data.

## Visual Direction

The design is currently split:

- Landing: expressive, glassy, motion-heavy, and brand-forward.
- Swarm launch: cinematic and technical, intended to make the agent pipeline feel tangible.
- Dashboard: more utilitarian, evidence-first, and designed for repeated scanning.

This split is acceptable for the hackathon demo if the narrative is intentional: landing creates interest, swarm proves technical depth, dashboard proves evidence utility.

## Components

- Company/region segmented controls.
- Live-mode onboarding fields and chip input.
- Demo-path buttons.
- Agent-status list and event log.
- 3D swarm constellation with WebGL fallback.
- Compact score blocks with animated score scramblers.
- Interactive globe with risk pins, arc links, controls, selected-state overlay, and legend.
- Source status rows.
- Evidence table with citation links.
- Complaint PDF primary actions.
- ElevenLabs voice-agent controls.

## Typography

- Dashboard typography should stay compact and readable.
- Landing and launch page type can be larger and more atmospheric, but text must remain readable over video and dark 3D backgrounds.
- Avoid adding explanatory instructional copy inside the app unless it directly supports the demo flow.

## Motion

- Landing uses motion for initial reveal and button feedback.
- Launch page uses progress, constellation movement, event updates, and score transitions to communicate system activity.
- Dashboard motion should stay functional: hover/focus feedback, loading states, globe interaction, and score count-up.

## Accessibility And Failure States

- WebGL components need visible nonblocking fallback states.
- Live source failures should present as blocked or pending states, not silent empty panels.
- Voice agent errors should remain inline and actionable.
- PDF generation errors should return JSON with a clear error code.
- The landing page footer links are placeholders and should not be treated as production navigation.

## Open Design Gaps

- Replace or wire placeholder footer links.
- Decide whether the landing glass/video aesthetic should be kept or brought closer to the dashboard style.
- Fill the benchmark panel with a real NGO report reference.
- Confirm mobile behavior for the launch constellation, globe controls, and evidence table before final demo.
