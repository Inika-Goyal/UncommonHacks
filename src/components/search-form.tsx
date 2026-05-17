"use client";

import { ArrowRight, Building2, Loader2, MapPinned, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useMemo, useState } from "react";

import {
  INDUSTRIES,
  OUTPUT_GOALS,
  REPORTER_PERSONAS,
  TIME_WINDOW_MONTHS,
  type Industry,
  type OutputGoal,
  type ReporterPersona,
  type TimeWindowMonths,
} from "@/lib/onboarding-types";
import type { InputType } from "@/lib/report-types";

type SearchFormProps = {
  initialInputType?: InputType;
  initialQuery?: string;
  compact?: boolean;
};

export function SearchForm({
  initialInputType = "company",
  initialQuery = "Shein",
  compact = false,
}: SearchFormProps) {
  const router = useRouter();
  const [inputType, setInputType] = useState<InputType>(initialInputType);
  const [query, setQuery] = useState(initialQuery);
  const [industry, setIndustry] = useState<Industry>("Apparel");
  const [countries, setCountries] = useState<string[]>([]);
  const [countryDraft, setCountryDraft] = useState("");
  const [timeWindowMonths, setTimeWindow] = useState<TimeWindowMonths>(12);
  const [reporterPersona, setReporterPersona] = useState<ReporterPersona>("NGO");
  const [outputGoal, setOutputGoal] = useState<OutputGoal>("complaint");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const placeholderQuery = useMemo(
    () => (inputType === "company" ? "Shein" : "Cambodia garment sector"),
    [inputType],
  );

  function addCountry(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (countries.includes(trimmed)) return;
    setCountries((prev) => [...prev, trimmed]);
    setCountryDraft("");
  }

  function handleCountryKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addCountry(countryDraft);
    } else if (event.key === "Backspace" && !countryDraft && countries.length) {
      setCountries((prev) => prev.slice(0, -1));
    }
  }

  function removeCountry(country: string) {
    setCountries((prev) => prev.filter((c) => c !== country));
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    setSubmitError(null);

    setSubmitting(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputType,
          query: cleanQuery,
          industry,
          countries,
          timeWindowMonths,
          reporterPersona,
          outputGoal,
        }),
      });
      const payload = (await response.json()) as
        | { ok: true; reportId: string }
        | { ok: false; error: string; code?: string };

      if (!payload.ok) {
        setSubmitError(payload.error);
        return;
      }

      router.push(`/swarm/${payload.reportId}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to start the swarm.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className={compact ? "search-shell search-shell-compact" : "search-shell"}
      onSubmit={submitSearch}
    >
      <div className="segmented-control" aria-label="Report input type">
        <button
          className={inputType === "company" ? "segment-button segment-button-active" : "segment-button"}
          type="button"
          onClick={() => setInputType("company")}
        >
          <Building2 aria-hidden="true" size={16} />
          Company
        </button>
        <button
          className={inputType === "region" ? "segment-button segment-button-active" : "segment-button"}
          type="button"
          onClick={() => setInputType("region")}
        >
          <MapPinned aria-hidden="true" size={16} />
          Region
        </button>
      </div>

      <label className="search-label" htmlFor={compact ? "dashboard-query" : "landing-query"}>
        Investigation target
      </label>
      <div className="query-row">
        <div className="query-input-wrap">
          <Search aria-hidden="true" size={18} />
          <input
            id={compact ? "dashboard-query" : "landing-query"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholderQuery}
          />
        </div>
        <button className="primary-button" type="submit" disabled={!query.trim() || submitting}>
          {submitting ? <Loader2 aria-hidden="true" className="spin-icon" size={16} /> : null}
          {submitting ? "Dispatching" : "Generate"}
          {submitting ? null : <ArrowRight aria-hidden="true" size={16} />}
        </button>
      </div>

      <div className="onboarding-extras">
        <div className="onboarding-row">
          <label className="onboarding-field">
            <span>Industry</span>
            <select
              value={industry}
              onChange={(event) => setIndustry(event.target.value as Industry)}
            >
              {INDUSTRIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="onboarding-field">
            <span>Time window</span>
            <select
              value={timeWindowMonths}
              onChange={(event) => setTimeWindow(Number(event.target.value) as TimeWindowMonths)}
            >
              {TIME_WINDOW_MONTHS.map((option) => (
                <option key={option} value={option}>
                  Last {option} months
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="onboarding-field">
          <span>Countries to weight</span>
          <div className="chip-input">
            {countries.map((country) => (
              <button
                key={country}
                type="button"
                className="chip"
                onClick={() => removeCountry(country)}
              >
                {country} <span aria-hidden>×</span>
              </button>
            ))}
            <input
              value={countryDraft}
              onChange={(event) => setCountryDraft(event.target.value)}
              onKeyDown={handleCountryKey}
              onBlur={() => addCountry(countryDraft)}
              placeholder="Add country, press Enter"
            />
          </div>
        </label>

        <fieldset className="onboarding-fieldset">
          <legend>Reporter persona</legend>
          <div className="onboarding-radio-row">
            {REPORTER_PERSONAS.map((option) => (
              <label key={option} className={reporterPersona === option ? "radio-chip radio-chip-active" : "radio-chip"}>
                <input
                  type="radio"
                  name="reporterPersona"
                  value={option}
                  checked={reporterPersona === option}
                  onChange={() => setReporterPersona(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="onboarding-fieldset">
          <legend>Output goal</legend>
          <div className="onboarding-radio-row">
            {OUTPUT_GOALS.map((option) => (
              <label key={option} className={outputGoal === option ? "radio-chip radio-chip-active" : "radio-chip"}>
                <input
                  type="radio"
                  name="outputGoal"
                  value={option}
                  checked={outputGoal === option}
                  onChange={() => setOutputGoal(option)}
                />
                {option === "complaint" ? "Labor-authority complaint" : "Compliance letter"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {submitError ? <p className="form-error">{submitError}</p> : null}
    </form>
  );
}
