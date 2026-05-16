export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SupplierPin {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  riskScore: number; // 1–5
  credibilityScore: number; // 1–5
  sources: string[];
}

export interface KeyFinding {
  agent: string;
  text: string;
}

export interface RecommendedAction {
  priority: 'urgent' | 'high' | 'medium';
  action: string;
}

export interface DemoReport {
  company: string;
  hqLat: number;
  hqLng: number;
  hqCountry: string;
  executiveSummary: string;
  suppliers: SupplierPin[];
  keyFindings: KeyFinding[];
  recommendedActions: RecommendedAction[];
}

export const HQ_LOCATION = { lat: 22.5431, lng: 114.0579, country: 'China (Shenzhen)' };

export const DEMO_SUPPLIERS: SupplierPin[] = [
  {
    id: 'bd-1',
    name: 'Dhaka Garment Mills Ltd.',
    country: 'Bangladesh',
    lat: 23.8103,
    lng: 90.4125,
    riskScore: 3,
    credibilityScore: 4,
    sources: ['Bangladesh Labour Inspectorate 2024', 'Worker Rights Consortium'],
  },
  {
    id: 'vn-1',
    name: 'Ho Chi Minh Textile Co.',
    country: 'Vietnam',
    lat: 10.8231,
    lng: 106.6297,
    riskScore: 2,
    credibilityScore: 4,
    sources: ['Vietnam MOL Compliance Report', 'Fair Labor Association'],
  },
  {
    id: 'cn-xj',
    name: 'Xinjiang Cotton Processors',
    country: 'China (Xinjiang)',
    lat: 41.2,
    lng: 85.5,
    riskScore: 5,
    credibilityScore: 5,
    sources: ['US CBP UFLPA Entity List', 'Sheffield Hallam University Report 2022', 'Australian Strategic Policy Institute'],
  },
  {
    id: 'kh-1',
    name: 'Phnom Penh Apparel Factory',
    country: 'Cambodia',
    lat: 11.5564,
    lng: 104.9282,
    riskScore: 3,
    credibilityScore: 3,
    sources: ['ILO Better Work Cambodia', 'Human Rights Watch 2023'],
  },
  {
    id: 'mm-1',
    name: 'Yangon Sewing Works',
    country: 'Myanmar',
    lat: 16.8661,
    lng: 96.1951,
    riskScore: 4,
    credibilityScore: 4,
    sources: ['UN Special Rapporteur Report 2023', 'Business & Human Rights Resource Centre'],
  },
  {
    id: 'in-1',
    name: 'Tirupur Knitting Cluster',
    country: 'India',
    lat: 11.1085,
    lng: 77.3411,
    riskScore: 2,
    credibilityScore: 3,
    sources: ['India Ministry of Labour Audit 2023', 'Sumangali Scheme Watch Report'],
  },
];

export const DEMO_REPORT: DemoReport = {
  company: 'Shein',
  hqLat: HQ_LOCATION.lat,
  hqLng: HQ_LOCATION.lng,
  hqCountry: HQ_LOCATION.country,
  executiveSummary:
    'Shein operates a vast, opaque supply chain spanning 6 high-risk manufacturing regions. ' +
    'Our analysis identified critical forced labour exposure in Xinjiang cotton supply chains, ' +
    'severe freedom-of-association violations in Myanmar facilities, and documented wage theft ' +
    'in Bangladeshi and Cambodian tier-1 suppliers. Combined risk index: 3.8 / 5 (HIGH). ' +
    'Immediate engagement with regulatory frameworks including the US UFLPA, UK Modern Slavery Act, ' +
    'and EU Corporate Sustainability Due Diligence Directive (CS3D) is recommended.',
  suppliers: DEMO_SUPPLIERS,
  keyFindings: [
    {
      agent: 'Watchlist Agent',
      text: 'Xinjiang Cotton Processors appears on the US CBP UFLPA Entity List (2022). Importation presumed to involve forced labour under US law unless rebutted.',
    },
    {
      agent: 'News Agent',
      text: 'Yangon Sewing Works linked to military-affiliated conglomerate MEHL per Reuters investigation (Nov 2023). Revenue directly funds armed forces.',
    },
    {
      agent: 'Supplier Agent',
      text: 'Dhaka Garment Mills failed three consecutive fire-safety audits (2022–2024). 1,200+ workers lack adequate emergency egress.',
    },
    {
      agent: 'Legal Agent',
      text: 'UK Modern Slavery Act §54 statement filed by Shein omits 4 of 6 identified high-risk suppliers, constituting a material misrepresentation.',
    },
    {
      agent: 'Risk Index Agent',
      text: 'Myanmar labour risk score elevated from 3 → 4 following February 2021 coup. ILO has suspended technical cooperation with Myanmar government.',
    },
    {
      agent: 'News Agent',
      text: 'Cambodia facility Phnom Penh Apparel linked to union-busting incident documented by Worker Rights Consortium Q2 2024.',
    },
  ],
  recommendedActions: [
    {
      priority: 'urgent',
      action: 'File UFLPA withhold-release order petition with US CBP naming Xinjiang Cotton Processors immediately.',
    },
    {
      priority: 'urgent',
      action: 'Escalate Myanmar supplier relationship to board level — continued sourcing creates direct legal exposure under UK MACT and US sanctions.',
    },
    {
      priority: 'high',
      action: 'Commission independent fire-safety remediation audit for Dhaka Garment Mills with 90-day corrective action plan.',
    },
    {
      priority: 'high',
      action: 'Amend UK Modern Slavery Act §54 statement to include all identified tier-1 and tier-2 suppliers within 30 days.',
    },
    {
      priority: 'medium',
      action: 'Engage ILO Better Work programme for Cambodia and Vietnam facilities to establish ongoing monitoring.',
    },
  ],
};

export const AGENTS = [
  { id: 'news', label: 'News Agent', description: 'Scanning global press & NGO reports' },
  { id: 'watchlist', label: 'Watchlist Agent', description: 'Cross-referencing UFLPA, SDN & sanctions lists' },
  { id: 'supplier', label: 'Supplier Agent', description: 'Mapping tier-1 & tier-2 supply chain' },
  { id: 'legal', label: 'Legal Agent', description: 'Analysing compliance filings & disclosures' },
  { id: 'risk', label: 'Risk Index Agent', description: 'Computing composite risk scores' },
] as const;

export type AgentId = typeof AGENTS[number]['id'];

export function getRiskColor(score: number): string {
  if (score >= 5) return '#ef4444'; // red-500
  if (score >= 4) return '#f97316'; // orange-500
  if (score >= 3) return '#f59e0b'; // amber-500
  return '#22c55e'; // green-500
}

export function getRiskLabel(score: number): string {
  if (score >= 5) return 'Critical';
  if (score >= 4) return 'High';
  if (score >= 3) return 'Medium';
  return 'Low';
}
