"use client";

import { ArrowRight, Building2, MapPinned, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();

    if (!cleanQuery) {
      return;
    }

    router.push(`/dashboard?mode=${inputType}&query=${encodeURIComponent(cleanQuery)}`);
  }

  return (
    <form className={compact ? "search-shell search-shell-compact" : "search-shell"} onSubmit={submitSearch}>
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
            placeholder={inputType === "company" ? "Shein" : "Cambodia garment sector"}
          />
        </div>
        <button className="primary-button" type="submit" disabled={!query.trim()}>
          Generate
          <ArrowRight aria-hidden="true" size={16} />
        </button>
      </div>
    </form>
  );
}
