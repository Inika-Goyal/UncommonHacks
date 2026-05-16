import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_ILO_NORMLEX = "ilo_normlex";

export type IloComplaint = {
  country: string;
  caseNumber: string;
  procedure: "CFA" | "Article 24" | "Article 26" | "CEACR";
  year: number;
  summary: string;
  url: string;
};

const COMPLAINTS_BY_COUNTRY: Record<string, IloComplaint[]> = {
  cambodia: [
    {
      country: "Cambodia",
      caseNumber: "CFA Case No. 3389",
      procedure: "CFA",
      year: 2021,
      summary:
        "Committee on Freedom of Association case alleging anti-union dismissals and harassment in the Cambodian garment sector.",
      url: "https://www.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:50002:0::NO::P50002_COMPLAINT_TEXT_ID,P50002_LANG_CODE:4079889,en",
    },
    {
      country: "Cambodia",
      caseNumber: "CFA Case No. 3287",
      procedure: "CFA",
      year: 2019,
      summary:
        "Murder of trade union leader Chea Vichea and ongoing failure to protect freedom of association in the garment industry.",
      url: "https://www.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:50002:0::NO::P50002_COMPLAINT_TEXT_ID,P50002_LANG_CODE:3946896,en",
    },
  ],
  china: [
    {
      country: "China",
      caseNumber: "CEACR observation",
      procedure: "CEACR",
      year: 2023,
      summary:
        "Committee of Experts observation on application of the Discrimination (Employment and Occupation) Convention, 1958, focused on labor transfer programs in Xinjiang.",
      url: "https://normlex.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:13100:0::NO::P13100_COMMENT_ID:4350350",
    },
  ],
  bangladesh: [
    {
      country: "Bangladesh",
      caseNumber: "Article 26 Complaint",
      procedure: "Article 26",
      year: 2019,
      summary:
        "Workers' delegate complaint concerning non-observance of Conventions Nos. 81, 87, and 98 by the Government of Bangladesh.",
      url: "https://www.ilo.org/dyn/normlex/en/f?p=1000:50012:0::NO::P50012_COMPLAINT_PROCEDURE_ID,P50012_LANG_CODE:3088482,en",
    },
  ],
  vietnam: [
    {
      country: "Vietnam",
      caseNumber: "CFA Case No. 3199",
      procedure: "CFA",
      year: 2017,
      summary:
        "Allegations concerning restrictions on freedom of association and lack of recognition of independent unions.",
      url: "https://www.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:50002:0::NO::P50002_COMPLAINT_TEXT_ID,P50002_LANG_CODE:3340148,en",
    },
  ],
  india: [
    {
      country: "India",
      caseNumber: "CEACR observation",
      procedure: "CEACR",
      year: 2022,
      summary:
        "CEACR observation on the application of the Forced Labour Convention, 1930, including bonded labour and brick kiln workers.",
      url: "https://normlex.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:13100:0::NO::P13100_COMMENT_ID:4119556",
    },
  ],
  thailand: [
    {
      country: "Thailand",
      caseNumber: "CFA Case No. 3164",
      procedure: "CFA",
      year: 2018,
      summary:
        "Allegations of anti-union dismissals against seafood workers and migrant labour vulnerabilities.",
      url: "https://www.ilo.org/dyn/normlex/en/f?p=NORMLEXPUB:50002:0::NO::P50002_COMPLAINT_TEXT_ID,P50002_LANG_CODE:3331567,en",
    },
  ],
  myanmar: [
    {
      country: "Myanmar",
      caseNumber: "Article 33 measures",
      procedure: "Article 26",
      year: 2022,
      summary:
        "Governing Body Article 33 measures concerning continued failure to suppress forced labour and recognise freedom of association.",
      url: "https://www.ilo.org/wcmsp5/groups/public/---ed_norm/---relconf/documents/meetingdocument/wcms_859125.pdf",
    },
  ],
};

export type IloLookup = {
  country: string;
  complaints: IloComplaint[];
};

function normalizeCountry(country: string): string {
  return country.toLowerCase().trim();
}

export async function lookupIloNormlex(countries: string[]): Promise<CacheLookup<IloLookup[]>> {
  const normalized = countries.map(normalizeCountry).filter(Boolean);
  const key = hashKey(["ilo_normlex", ...normalized.sort()]);

  return withCache<IloLookup[]>(
    SOURCE_ILO_NORMLEX,
    key,
    { ttlMs: TTL.WEEK, staleTtlMs: TTL.MONTH },
    async () => {
      // For MVP we use a curated set of well-known cases. The NORMLEX site has no
      // clean API; live scraping is brittle. Cached entries are still labeled
      // with a public NORMLEX URL so citations point at the authoritative source.
      const results: IloLookup[] = normalized.map((country) => ({
        country,
        complaints: COMPLAINTS_BY_COUNTRY[country] ?? [],
      }));

      return results;
    },
  );
}
