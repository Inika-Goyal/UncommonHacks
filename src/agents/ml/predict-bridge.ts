/**
 * Bridge from the TS synthesis layer to the Python ML predict CLI.
 *
 * Accepts a single country or a basket of countries (supply chain).
 * Returns a structured MlPrediction including:
 *   - primary country prediction (back-compat top-level fields)
 *   - byCountry: per-country predictions
 *   - supplyChain: aggregated worst-link severity + weighted prevalence
 *
 * If the CLI fails (missing artifacts, unknown country, Python error,
 * non-zero exit), throws an MlBridgeError with a structured `reason`
 * code so the dashboard can render an accurate message rather than
 * the generic "country not in panel" text.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import type { MlPrediction } from "@/lib/report-types";

export type { MlPrediction } from "@/lib/report-types";

// Normalised (camelCase) score shape used by the TS layer + localScoring
// fallback. The Python CLI returns snake_case; synthesize.ts maps it.
export type MlScores = {
  severity: number;
  credibility: number;
  overallRisk: number;
  rationale: string;
};

export type PredictRequest = {
  countries: string[];
  weights?: Record<string, number>;
  year?: number;
};

export type MlBridgeReason =
  | "ML_NO_COUNTRY"
  | "ML_COUNTRY_NOT_IN_PANEL"
  | "ML_ARTIFACTS_MISSING"
  | "ML_CLI_UNREACHABLE"
  | "ML_CLI_ERROR";

export class MlBridgeError extends Error {
  reason: MlBridgeReason;
  detail?: string;
  constructor(reason: MlBridgeReason, message: string, detail?: string) {
    super(message);
    this.reason = reason;
    this.detail = detail;
  }
}

const ML_ROOT = path.resolve(process.cwd(), "ml");
const GEO_ARTIFACT = path.join(ML_ROOT, "artifacts", "geographic", "geo_model.joblib");
const CLUSTER_ARTIFACT = path.join(ML_ROOT, "artifacts", "cluster", "cluster_model.joblib");
const LOCAL_VENV_DIR = ".venv";

function getPythonBin() {
  if (process.env.ML_PYTHON_BIN) return process.env.ML_PYTHON_BIN;
  // Build the venv path at runtime. Turbopack traces literal filesystem
  // references during `next build`, and ml/.venv/bin/python is a symlink
  // to the system Python outside the project root.
  return [ML_ROOT, LOCAL_VENV_DIR, "bin", "python"].join(path.sep);
}

let artifactCheckLogged = false;
function checkArtifacts(): MlBridgeError | null {
  if (existsSync(GEO_ARTIFACT) && existsSync(CLUSTER_ARTIFACT)) return null;
  if (!artifactCheckLogged) {
    console.error(
      `[ml] artifacts missing — run \`pnpm ml:train\`. Looking for:\n  ${GEO_ARTIFACT}\n  ${CLUSTER_ARTIFACT}`,
    );
    artifactCheckLogged = true;
  }
  return new MlBridgeError(
    "ML_ARTIFACTS_MISSING",
    "ML model artifacts are not on disk. Run `pnpm ml:train` to generate them.",
  );
}

export async function predictWithMl(req: PredictRequest): Promise<MlPrediction> {
  if (!req.countries || req.countries.length === 0) {
    throw new MlBridgeError(
      "ML_NO_COUNTRY",
      "No country was resolved from this query, so the ML model could not run.",
    );
  }
  const artifactErr = checkArtifacts();
  if (artifactErr) throw artifactErr;

  return new Promise((resolve, reject) => {
    const child = spawn(getPythonBin(), ["-m", "ml.pipelines.predict"], {
      cwd: path.dirname(ML_ROOT), // repo root, so `-m ml.pipelines...` resolves
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      reject(
        new MlBridgeError(
          "ML_CLI_UNREACHABLE",
          `Could not spawn the Python ML CLI (${(err as Error).message}). Check ML_PYTHON_BIN.`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const trimmed = stderr.trim();
        const reason: MlBridgeReason =
          /not in the trained.*panel/i.test(trimmed) || /Unknown country/i.test(trimmed)
            ? "ML_COUNTRY_NOT_IN_PANEL"
            : "ML_CLI_ERROR";
        reject(
          new MlBridgeError(
            reason,
            `Python ML CLI exited with code ${code}.`,
            trimmed || "no stderr",
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as MlPrediction);
      } catch (e) {
        reject(
          new MlBridgeError(
            "ML_CLI_ERROR",
            `Python ML CLI returned non-JSON output: ${(e as Error).message}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify(req));
    child.stdin.end();
  });
}

/**
 * Deterministic fallback when the Python CLI is unavailable.
 * Returns the normalised camelCase MlScores shape.
 */
export function localScoring(featureCounts: {
  watchlistMatches: number;
  courtCases: number;
  newsArticles: number;
  gsiWeighted: number | null;
  findingCount: number;
}): MlScores {
  const { watchlistMatches, courtCases, newsArticles, gsiWeighted, findingCount } = featureCounts;
  const severity = Math.min(
    5,
    Math.max(
      1,
      Math.round(
        1 + watchlistMatches * 1.2 + (gsiWeighted ?? 0) * 0.05 + courtCases * 0.2,
      ),
    ),
  );
  const credibility = Math.min(
    5,
    Math.max(1, Math.round(1 + Math.log10(1 + newsArticles) + courtCases * 0.1)),
  );
  const overallRisk = Math.min(
    100,
    severity * 12 + credibility * 4 + findingCount * 3 + watchlistMatches * 8,
  );
  return {
    severity,
    credibility,
    overallRisk,
    rationale:
      "Deterministic fallback scoring (Python ML CLI unavailable). " +
      "Severity weights watchlist hits and GSI prevalence; credibility weights " +
      "corroborating sources; overall is a fixed linear combination.",
  };
}
