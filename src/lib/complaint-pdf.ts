import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { Report } from "@/lib/report-types";

function wrapText(text: string, maxCharacters: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export async function createComplaintPdf(report: Report) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.12, 0.1, 0.08);
  const muted = rgb(0.38, 0.34, 0.3);
  let y = 732;

  const drawLine = (text: string, options?: { size?: number; font?: typeof regular; color?: ReturnType<typeof rgb> }) => {
    page.drawText(text, {
      x: 64,
      y,
      size: options?.size ?? 11,
      font: options?.font ?? regular,
      color: options?.color ?? ink,
    });
    y -= (options?.size ?? 11) + 7;
  };

  drawLine("Formal Complaint Draft", { size: 18, font: bold });
  drawLine(`Generated from UnExploited report: ${report.title}`, { size: 10, color: muted });
  y -= 16;
  drawLine("To: Labor authority or corporate compliance officer", { font: bold });
  drawLine("Re: Request for investigation and remediation of labor exploitation indicators", { font: bold });
  y -= 12;

  const paragraphs = [
    `This letter requests review of exploitation-risk indicators identified for ${report.query}. The attached evidence summary indicates an overall risk score of ${report.overallRisk}/100, severity ${report.severity}/5, and credibility ${report.credibility}/5.`,
    report.summary,
    report.recommendedAction,
    "We request disclosure of relevant supplier records, audit history, remediation steps, and any jurisdiction-specific filings or complaints related to the findings below.",
  ];

  for (const paragraph of paragraphs) {
    for (const line of wrapText(paragraph, 86)) {
      drawLine(line);
    }
    y -= 8;
  }

  drawLine("Evidence Summary", { size: 14, font: bold });

  for (const finding of report.findings) {
    if (y < 120) {
      y = 732;
      page = pdf.addPage([612, 792]);
    }

    drawLine(`${finding.signal} (${finding.geography})`, { font: bold });
    for (const line of wrapText(finding.evidence, 86)) {
      drawLine(line);
    }
    const citationLabels = finding.citations.map((citation) => citation.label).join("; ");
    drawLine(`Sources: ${citationLabels}`, { size: 10, color: muted });
    y -= 8;
  }

  y -= 4;
  drawLine("Prepared by UnExploited MVP. Verify all live sources before sending.", { size: 10, color: muted });

  return pdf.save();
}
