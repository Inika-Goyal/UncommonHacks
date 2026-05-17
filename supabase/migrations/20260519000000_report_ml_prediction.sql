-- Adds a nullable JSONB column that stores the full MlPrediction blob produced
-- by the Python ML CLI. Reports that ran before this column existed, or where
-- the country couldn't be resolved to an ISO3 in the trained panel, simply
-- leave it NULL and the dashboard falls back to a graceful empty state.

alter table public.reports
  add column if not exists ml_prediction jsonb;
