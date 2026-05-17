/**
 * Bridge from the TS synthesis layer to the Python ML predict CLI.
 *
 * The Python script (ml/pipelines/predict.py) returns severity,
 * credibility, overall_risk, per-exploit predicted prevalence with
 * conformal uncertainty bands, cluster info, and source citations.
 * The LLM is no longer in the scoring path — it only writes prose.
 *
 * If the CLI fails (no model artifacts, unknown ISO3, missing
 * Python), the caller should fall back to the deterministic
 * `localScoring` helper below.
 */
import { spawn } from "node:child_process";
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
  country: string;
  // Optional now — the model is cross-sectional and the CLI ignores
  // year. Kept on the wire for forward compatibility.
  year?: number;
  exploits?: string[];
};

const ML_ROOT = path.resolve(process.cwd(), "ml");
const PYTHON_BIN = process.env.ML_PYTHON_BIN ?? path.join(ML_ROOT, ".venv", "bin", "python");

export async function predictWithMl(req: PredictRequest): Promise<MlPrediction> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, ["-m", "ml.pipelines.predict"], {
      cwd: path.dirname(ML_ROOT), // repo root, so `-m ml.pipelines...` resolves
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`predict CLI exited ${code}: ${stderr.trim() || "no stderr"}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as MlPrediction);
      } catch (e) {
        reject(new Error(`predict CLI returned non-JSON: ${(e as Error).message}`));
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
