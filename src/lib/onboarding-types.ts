import { z } from "zod";

import type { InputType } from "@/lib/report-types";

export const REPORTER_PERSONAS = ["NGO", "Compliance", "Advocate"] as const;
export type ReporterPersona = (typeof REPORTER_PERSONAS)[number];

export const OUTPUT_GOALS = ["complaint", "compliance"] as const;
export type OutputGoal = (typeof OUTPUT_GOALS)[number];

export const TIME_WINDOW_MONTHS = [3, 6, 12, 24] as const;
export type TimeWindowMonths = (typeof TIME_WINDOW_MONTHS)[number];

export const INDUSTRIES = [
  "Apparel",
  "Electronics",
  "Agriculture",
  "Mining",
  "Seafood",
  "Construction",
  "Other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const onboardingAnswersSchema = z.object({
  inputType: z.enum(["company", "region"]),
  query: z.string().trim().min(1, "query is required"),
  industry: z.enum(INDUSTRIES).optional(),
  countries: z.array(z.string().trim().min(1)).default([]),
  timeWindowMonths: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24)]).default(12),
  reporterPersona: z.enum(REPORTER_PERSONAS).default("NGO"),
  outputGoal: z.enum(OUTPUT_GOALS).default("complaint"),
});

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema> & {
  inputType: InputType;
};
