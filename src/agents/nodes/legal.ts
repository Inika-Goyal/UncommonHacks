import type { Citation } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupCourtListener, type CourtListenerResult } from "@/agents/tools/courtlistener";
import { lookupIloNormlex, type IloComplaint } from "@/agents/tools/ilo-normlex";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

const accessedAt = () => new Date().toISOString().slice(0, 10);

function formatCourtCases(rows: CourtListenerResult[]): string {
  if (rows.length === 0) return "No CourtListener matches.";
  return rows
    .slice(0, 15)
    .map(
      (row, idx) =>
        `${idx + 1}. ${row.caseName} | ${row.court} | filed=${row.dateFiled ?? "n/a"} | ${row.absoluteUrl}\n   ${row.snippet ?? ""}`,
    )
    .join("\n");
}

function formatIlo(complaints: IloComplaint[]): string {
  if (complaints.length === 0) return "No ILO NORMLEX complaints recorded for the given countries.";
  return complaints
    .map(
      (c, idx) =>
        `${idx + 1}. [${c.country}] ${c.caseNumber} (${c.procedure}, ${c.year}) — ${c.summary}\n   ${c.url}`,
    )
    .join("\n");
}

export async function legalNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "legal",
    reportId: state.reportId,
    runner: async () => {
      const [courtResult, iloResult] = await Promise.all([
        lookupCourtListener(state.query),
        lookupIloNormlex(state.countries),
      ]);

      const courts = courtResult.source !== "miss"
        ? courtResult.payload
        : { total: 0, results: [], flsaCount: 0, mostRecentFilingDate: null };

      const ilo = iloResult.source !== "miss" ? iloResult.payload : [];
      const allComplaints = ilo.flatMap((entry) => entry.complaints);

      const evidence = `CourtListener results (${courts.total} total, ${courts.flsaCount} FLSA):
${formatCourtCases(courts.results)}

ILO NORMLEX complaints across countries [${state.countries.join(", ") || "—"}]:
${formatIlo(allComplaints)}`;

      const findings = await extractFindingsWithLlm({
        agent: "legal",
        evidence,
        instructions: `Subject: ${state.query}. Each citation must reference CourtListener (https://www.courtlistener.com/) or ILO NORMLEX (https://normlex.ilo.org/). Use real URLs from the evidence. Accessed date: ${accessedAt()}.`,
      });

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations: finding.citations.length > 0
          ? finding.citations
          : ([
              {
                label: "CourtListener labor search",
                source: "Free Law Project / CourtListener",
                url: `https://www.courtlistener.com/?q=${encodeURIComponent(state.query)}`,
                accessedAt: accessedAt(),
              },
            ] satisfies Citation[]),
      }));

      const rawFeatures = {
        courtCaseCount: courts.total,
        flsaCaseCount: courts.flsaCount,
        iloComplaintCount: allComplaints.length,
        mostRecentFilingDate: courts.mostRecentFilingDate,
      };

      return {
        status: courtResult.source === "live" ? "ready" as const : "snapshot" as const,
        detail: `${courts.total} court matches (${courts.flsaCount} FLSA); ${allComplaints.length} ILO complaints.`,
        findings: decoratedFindings,
        rawFeatures,
      };
    },
  });

  return { agents: { legal: result } };
}
