import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { EXPLOIT_CATEGORY_LABELS, type Citation, type Finding, type Report } from "@/lib/report-types";

const palette = {
  ink: "#171717",
  slate: "#3f4a54",
  muted: "#6b7280",
  line: "#d7dce0",
  paper: "#f8f5ef",
  white: "#ffffff",
  amber: "#c46f24",
  red: "#a43f3f",
  teal: "#1f6f68",
  blue: "#2f5c88",
  green: "#46735c",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 42,
    paddingBottom: 54,
    paddingLeft: 42,
    backgroundColor: palette.paper,
    color: palette.ink,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.45,
  },
  coverBand: {
    padding: 22,
    backgroundColor: palette.ink,
    color: palette.white,
    borderRadius: 6,
    marginBottom: 18,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  brand: {
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#d8dfd9",
  },
  label: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: palette.muted,
    marginBottom: 4,
  },
  labelLight: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#b9c3c0",
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 1.06,
    fontFamily: "Helvetica-Bold",
    maxWidth: 420,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 11,
    color: "#dbe4e0",
    maxWidth: 430,
  },
  metaGrid: {
    flexDirection: "row",
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#4a4a4a",
    paddingTop: 14,
  },
  metaCell: {
    width: "33.333%",
    paddingRight: 12,
  },
  metaValue: {
    fontSize: 10,
    color: palette.white,
    fontFamily: "Helvetica-Bold",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    color: palette.ink,
  },
  card: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 10.5,
    color: palette.slate,
  },
  scoreRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  scoreTile: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    padding: 12,
    marginRight: 8,
  },
  scoreTileLast: {
    marginRight: 0,
  },
  scoreValue: {
    fontSize: 24,
    lineHeight: 1,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  scoreDanger: {
    color: palette.red,
  },
  scoreWarning: {
    color: palette.amber,
  },
  scoreInfo: {
    color: palette.blue,
  },
  scoreLabel: {
    fontSize: 7,
    color: palette.muted,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  actionCard: {
    borderLeftWidth: 4,
    borderLeftColor: palette.teal,
  },
  actionText: {
    fontSize: 11,
    color: palette.ink,
    fontFamily: "Helvetica-Bold",
  },
  findingCard: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  findingHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  findingTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    maxWidth: 330,
  },
  badgeRow: {
    flexDirection: "row",
  },
  badge: {
    fontSize: 7,
    color: palette.white,
    backgroundColor: palette.slate,
    borderRadius: 999,
    paddingTop: 3,
    paddingRight: 7,
    paddingBottom: 3,
    paddingLeft: 7,
    marginLeft: 4,
  },
  badgeRed: {
    backgroundColor: palette.red,
  },
  badgeBlue: {
    backgroundColor: palette.blue,
  },
  findingMeta: {
    fontSize: 8,
    color: palette.muted,
    marginBottom: 6,
  },
  evidence: {
    fontSize: 9.5,
    color: palette.slate,
    marginBottom: 8,
  },
  citationText: {
    fontSize: 8,
    color: palette.muted,
  },
  sourceGrid: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: palette.white,
  },
  sourceRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    minHeight: 34,
  },
  sourceRowLast: {
    borderBottomWidth: 0,
  },
  sourceName: {
    width: "34%",
    padding: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  sourceStatus: {
    width: "16%",
    padding: 8,
    fontSize: 8,
    textTransform: "uppercase",
    color: palette.teal,
    fontFamily: "Helvetica-Bold",
  },
  sourceDetail: {
    width: "50%",
    padding: 8,
    fontSize: 8.5,
    color: palette.slate,
  },
  appendixTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  appendixItem: {
    marginBottom: 9,
  },
  link: {
    color: palette.blue,
    textDecoration: "none",
  },
  footer: {
    position: "absolute",
    left: 42,
    right: 42,
    bottom: 24,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: "row",
    justifyContent: "space-between",
    color: palette.muted,
    fontSize: 7.5,
  },
  disclaimer: {
    fontSize: 8.5,
    color: palette.muted,
    marginTop: 8,
  },
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function inputTypeLabel(report: Report) {
  return report.inputType === "company" ? "Company investigation" : "Regional investigation";
}

function scoreToneStyle(tone: "danger" | "warning" | "info") {
  if (tone === "danger") return styles.scoreDanger;
  if (tone === "warning") return styles.scoreWarning;
  return styles.scoreInfo;
}

function sourceStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function compactCitations(citations: Citation[]) {
  if (citations.length === 0) return "No citations attached.";
  return citations.map((citation) => citation.label).join("; ");
}

function uniqueCitations(report: Report) {
  const citations = new Map<string, Citation>();
  for (const finding of report.findings) {
    for (const citation of finding.citations) {
      citations.set(`${citation.label}-${citation.url}`, citation);
    }
  }
  return [...citations.values()];
}

function categoryLabel(finding: Finding) {
  return finding.category ? EXPLOIT_CATEGORY_LABELS[finding.category] : "Evidence signal";
}

function ScoreTile({
  label,
  value,
  suffix,
  tone,
  last = false,
}: {
  label: string;
  value: number;
  suffix: string;
  tone: "danger" | "warning" | "info";
  last?: boolean;
}) {
  return (
    <View style={last ? [styles.scoreTile, styles.scoreTileLast] : styles.scoreTile}>
      <Text style={[styles.scoreValue, scoreToneStyle(tone)]}>
        {value}
        {suffix}
      </Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

function FindingBlock({ finding, index }: { finding: Finding; index: number }) {
  return (
    <View style={styles.findingCard} wrap={false}>
      <View style={styles.findingHead}>
        <Text style={styles.findingTitle}>
          {index + 1}. {finding.signal}
        </Text>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, styles.badgeRed]}>S {finding.severity}/5</Text>
          <Text style={[styles.badge, styles.badgeBlue]}>C {finding.credibility}/5</Text>
        </View>
      </View>
      <Text style={styles.findingMeta}>
        {finding.geography} | {categoryLabel(finding)}
      </Text>
      <Text style={styles.evidence}>{finding.evidence}</Text>
      <Text style={styles.citationText}>Sources: {compactCitations(finding.citations)}</Text>
    </View>
  );
}

function Footer({ report }: { report: Report }) {
  return (
    <View style={styles.footer} fixed>
      <Text>UnExploited report artifact | {report.id}</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function ComplaintPdfDocument({ report }: { report: Report }) {
  const citations = uniqueCitations(report);

  return (
    <Document
      title={`${report.query} complaint draft`}
      author="UnExploited"
      subject="Labor exploitation risk report and complaint draft"
      creator="UnExploited"
      producer="UnExploited"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.coverBand}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>UnExploited / Lumina</Text>
            <Text style={styles.brand}>Complaint draft</Text>
          </View>
          <Text style={styles.labelLight}>{inputTypeLabel(report)}</Text>
          <Text style={styles.title}>{report.query}</Text>
          <Text style={styles.subtitle}>{report.title}</Text>
          <View style={styles.metaGrid}>
            <View style={styles.metaCell}>
              <Text style={styles.labelLight}>Generated</Text>
              <Text style={styles.metaValue}>{formatDate(report.createdAt)}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.labelLight}>Findings</Text>
              <Text style={styles.metaValue}>{report.findings.length}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.labelLight}>Sources checked</Text>
              <Text style={styles.metaValue}>{report.sourceChecks.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <ScoreTile label="Overall risk" value={report.overallRisk} suffix="/100" tone="danger" />
          <ScoreTile label="Severity" value={report.severity} suffix="/5" tone="warning" />
          <ScoreTile label="Credibility" value={report.credibility} suffix="/5" tone="info" last />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <View style={styles.card}>
            <Text style={styles.summaryText}>{report.summary}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommended Action</Text>
          <View style={[styles.card, styles.actionCard]}>
            <Text style={styles.actionText}>{report.recommendedAction}</Text>
            <Text style={styles.disclaimer}>
              Prepared as an investigative draft. Verify source URLs, jurisdiction, and filing
              requirements before submitting to a labor authority or compliance recipient.
            </Text>
          </View>
        </View>

        <Footer report={report} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.appendixTitle}>Evidence Findings</Text>
        {report.findings.length > 0 ? (
          report.findings.map((finding, index) => (
            <FindingBlock key={finding.id} finding={finding} index={index} />
          ))
        ) : (
          <View style={styles.card}>
            <Text style={styles.summaryText}>No evidence findings were attached to this report.</Text>
          </View>
        )}

        <Footer report={report} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.appendixTitle}>Source Review</Text>
        <View style={styles.sourceGrid}>
          {report.sourceChecks.map((source, index) => (
            <View
              key={`${source.name}-${index}`}
              style={
                index === report.sourceChecks.length - 1
                  ? [styles.sourceRow, styles.sourceRowLast]
                  : styles.sourceRow
              }
              wrap={false}
            >
              <Text style={styles.sourceName}>{source.name}</Text>
              <Text style={styles.sourceStatus}>{sourceStatusLabel(source.status)}</Text>
              <Text style={styles.sourceDetail}>{source.detail}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 20 }}>
          <Text style={styles.appendixTitle}>Citation Appendix</Text>
          {citations.length > 0 ? (
            citations.map((citation, index) => (
              <View key={`${citation.label}-${citation.url}`} style={styles.appendixItem}>
                <Text style={styles.findingTitle}>
                  {index + 1}. {citation.label}
                </Text>
                <Text style={styles.citationText}>
                  {citation.source} | Accessed {formatDate(citation.accessedAt)}
                </Text>
                <Link src={citation.url} style={styles.link}>
                  {citation.url}
                </Link>
              </View>
            ))
          ) : (
            <Text style={styles.summaryText}>No citation URLs were attached to this report.</Text>
          )}
        </View>

        {report.mlPrediction ? (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.appendixTitle}>Model Intelligence</Text>
            <View style={styles.card}>
              <Text style={styles.summaryText}>
                The prevalence model predicts {report.mlPrediction.geographic_overall.predicted_prevalence_per_1k} cases
                per 1,000 people for {report.mlPrediction.country_name}. The uncertainty band is{" "}
                {report.mlPrediction.geographic_overall.uncertainty_band_p10_p90[0]} to{" "}
                {report.mlPrediction.geographic_overall.uncertainty_band_p10_p90[1]} per 1,000.
              </Text>
              <Text style={styles.disclaimer}>{report.mlPrediction.scores.rationale}</Text>
            </View>
          </View>
        ) : null}

        <Footer report={report} />
      </Page>
    </Document>
  );
}

export async function createComplaintPdf(report: Report) {
  return renderToBuffer(<ComplaintPdfDocument report={report} />);
}
