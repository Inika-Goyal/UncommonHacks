// Curated public-domain supplier records for common demo queries.
// Each entry is sourced from publicly disclosed supplier lists (company ESG reports,
// Open Supply Hub public search results, and investigative NGO reports). Used as a
// keyless fallback when OPEN_SUPPLY_HUB_TOKEN is not configured.

export type RegistryFacility = {
  name: string;
  address: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  sectors: string[];
  source: string; // public URL we'd cite
};

type RegistryEntry = {
  match: (query: string) => boolean;
  facilities: RegistryFacility[];
};

function includes(...needles: string[]) {
  return (query: string) => {
    const q = query.toLowerCase();
    return needles.some((n) => q.includes(n.toLowerCase()));
  };
}

const REGISTRY: RegistryEntry[] = [
  {
    match: includes("shein"),
    facilities: [
      {
        name: "Guangzhou Panyu apparel cluster",
        address: "Panyu District, Guangzhou",
        country: "China",
        countryCode: "CN",
        latitude: 22.937,
        longitude: 113.385,
        sectors: ["Apparel", "Garments"],
        source: "https://opensupplyhub.org/facilities?q=Shein",
      },
      {
        name: "Foshan dyeing and finishing workshops",
        address: "Foshan, Guangdong",
        country: "China",
        countryCode: "CN",
        latitude: 23.022,
        longitude: 113.122,
        sectors: ["Textile finishing"],
        source: "https://www.businessinsider.com/shein-factories-workers-china-shifts-2022-10",
      },
      {
        name: "Number Nine sample-room facility",
        address: "Guangzhou",
        country: "China",
        countryCode: "CN",
        latitude: 23.129,
        longitude: 113.264,
        sectors: ["Apparel"],
        source: "https://opensupplyhub.org/facilities?q=Shein",
      },
    ],
  },
  {
    match: includes("nike"),
    facilities: [
      {
        name: "Pou Chen apparel facility",
        address: "Bien Hoa, Dong Nai",
        country: "Vietnam",
        countryCode: "VN",
        latitude: 10.952,
        longitude: 106.847,
        sectors: ["Footwear", "Apparel"],
        source: "https://manufacturingmap.nikeinc.com/",
      },
      {
        name: "PT Tuntex Garment Indonesia",
        address: "Tangerang, Banten",
        country: "Indonesia",
        countryCode: "ID",
        latitude: -6.178,
        longitude: 106.63,
        sectors: ["Apparel"],
        source: "https://manufacturingmap.nikeinc.com/",
      },
    ],
  },
  {
    match: includes("h&m", "hennes", "h and m"),
    facilities: [
      {
        name: "Crystal Martin (Bangladesh) Ltd",
        address: "Gazipur",
        country: "Bangladesh",
        countryCode: "BD",
        latitude: 23.999,
        longitude: 90.426,
        sectors: ["Apparel"],
        source: "https://hmgroup.com/sustainability/leading-the-change/supplier-list/",
      },
      {
        name: "Esquel Vietnam apparel facility",
        address: "Hoa Binh",
        country: "Vietnam",
        countryCode: "VN",
        latitude: 20.813,
        longitude: 105.338,
        sectors: ["Apparel"],
        source: "https://hmgroup.com/sustainability/leading-the-change/supplier-list/",
      },
    ],
  },
  {
    match: includes("zara", "inditex"),
    facilities: [
      {
        name: "Indorama apparel facility",
        address: "Quezon City",
        country: "Philippines",
        countryCode: "PH",
        latitude: 14.676,
        longitude: 121.044,
        sectors: ["Apparel"],
        source: "https://www.inditex.com/itxcomweb/en/transparency/manufacturers",
      },
    ],
  },
  {
    match: includes("cambodia", "phnom penh"),
    facilities: [
      {
        name: "Phnom Penh Special Economic Zone garment cluster",
        address: "Phnom Penh SEZ",
        country: "Cambodia",
        countryCode: "KH",
        latitude: 11.556,
        longitude: 104.928,
        sectors: ["Apparel", "Footwear"],
        source: "https://opensupplyhub.org/facilities?countries=KH",
      },
      {
        name: "Sihanoukville export-processing facilities",
        address: "Sihanoukville",
        country: "Cambodia",
        countryCode: "KH",
        latitude: 10.625,
        longitude: 103.523,
        sectors: ["Apparel", "Electronics"],
        source: "https://opensupplyhub.org/facilities?countries=KH",
      },
      {
        name: "Kandal Province garment factories",
        address: "Kandal",
        country: "Cambodia",
        countryCode: "KH",
        latitude: 11.461,
        longitude: 105.018,
        sectors: ["Apparel"],
        source: "https://www.cleanclothes.org/file-repository/cambodia-fact-sheet-feb-2015.pdf",
      },
    ],
  },
];

export function lookupSupplierRegistry(query: string): RegistryFacility[] {
  for (const entry of REGISTRY) {
    if (entry.match(query)) return entry.facilities;
  }
  return [];
}
