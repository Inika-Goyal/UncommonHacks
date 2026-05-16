import { ReportDashboard } from "@/components/report-dashboard";
import type { InputType } from "@/lib/report-types";

type DashboardPageProps = {
  searchParams: Promise<{
    mode?: string | string[];
    query?: string | string[];
  }>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const mode = readParam(params.mode);
  const query = readParam(params.query);
  const inputType: InputType = mode === "region" ? "region" : "company";
  const fallbackQuery = inputType === "region" ? "Cambodia garment sector" : "Shein";

  return <ReportDashboard initialInputType={inputType} initialQuery={query?.trim() || fallbackQuery} />;
}
