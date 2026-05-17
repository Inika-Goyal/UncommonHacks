# Raw input data

These three CSVs are the only training inputs. They are committed so
the model is reproducible from a clean clone without API keys.

## Files

### `gsi_2023.csv`

- **Source**: Walk Free, *Global Slavery Index 2023*.
- **Original URL** (XLSX): `https://www.walkfree.org/global-slavery-index/downloads/`
  (the "Download" button on that page). The XLSX used here was obtained via a
  public GitHub mirror that copied Walk Free's published file verbatim
  (`AyoDataDriven/Team-Project-Global-Slavery-Index-Performance-Analysis-2024`).
- **Downloaded**: 2026-05-17.
- **License**: Walk Free publishes the GSI under CC-BY-NC 4.0.
- **Schema**: `iso3, country_name, region, population, prevalence_per_1k,
  estimated_number, vulnerability_total, govt_response_total`.
  180 rows; 160 with a non-null prevalence estimate.

### `wdi.csv`

- **Source**: World Bank, *World Development Indicators*.
- **Original URL**: `https://api.worldbank.org/v2/country/all/indicator/<CODE>?format=json&date=2021&per_page=400`
  for each of: `NY.GDP.PCAP.CD`, `SP.POP.TOTL`, `SP.URB.TOTL.IN.ZS`,
  `SL.UEM.TOTL.ZS`, `SI.POV.GINI` (multi-year, take most recent),
  `SP.POP.DPND.YG`. Pivoted to a single wide CSV.
- **Downloaded**: 2026-05-17.
- **License**: CC-BY 4.0.
- **Schema**: `iso3, gdp_per_capita, population, urban_share,
  unemployment, youth_dep_ratio, gini, year`. 261 rows (includes
  regional aggregates; the inner-join in `data/real.py` drops those).

### `rsf_2021.csv`

- **Source**: Reporters Without Borders, *World Press Freedom Index 2021*.
- **Original URL**: `https://rsf.org/sites/default/files/import_classement/2021.csv`
  (a public, no-auth CSV).
- **Downloaded**: 2026-05-17.
- **License**: CC-BY-SA.
- **Schema**: `iso3, press_freedom_score, country_name`. 180 rows.
  Score is 0–100; higher = freer.

## Refreshing

Re-running the downloads in 2027+ requires:

1. Walk Free GSI: visit the downloads page above; convert the XLSX
   sheet `GSI 2023 summary data` (or its newer equivalent) to CSV;
   keep columns Country / Population / Region / Estimated prevalence
   per 1,000 population / Estimated number / Total Vulnerability score
   / Government response total. Map country names to ISO3.
2. WDI: re-curl each indicator JSON; pivot.
3. RSF: re-curl `https://rsf.org/sites/default/files/import_classement/<year>.csv`;
   note the separator (`;`) and decimal (`,`).

After refresh, re-run `python -m ml.data.real --check` to confirm the
inner-join row count is still reasonable.
