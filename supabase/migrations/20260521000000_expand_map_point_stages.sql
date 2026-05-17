-- Expands map point stages for representative supply-chain graph composition.
-- Legacy values remain valid so existing demo and saved reports continue to load.

alter table public.map_points
  drop constraint if exists map_points_stage_check,
  add constraint map_points_stage_check
    check (stage in (
      'raw_material',
      'component_or_processing',
      'assembly',
      'transit',
      'distribution',
      'consumer_market',
      'origin',
      'labor',
      'factory',
      'consumer'
    ));
