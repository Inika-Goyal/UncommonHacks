"use client";

import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { useMemo } from "react";

import type { MapPoint } from "@/lib/report-types";

type WorldGlobeProps = {
  points: MapPoint[];
};

const riskClass = {
  high: "globe-point-high",
  medium: "globe-point-medium",
  low: "globe-point-low",
} satisfies Record<MapPoint["risk"], string>;

export function WorldGlobe({ points }: WorldGlobeProps) {
  const primaryPoint = points[0];
  const projection = useMemo(() => {
    return geoOrthographic()
      .scale(142)
      .translate([170, 170])
      .rotate(primaryPoint ? [-primaryPoint.longitude, -primaryPoint.latitude + 6] : [-20, -10])
      .clipAngle(90);
  }, [primaryPoint]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const spherePath = path({ type: "Sphere" });
  const graticulePath = path(geoGraticule10());

  return (
    <div className="globe-wrap" aria-label="Geographic report signals">
      <svg className="globe-svg" viewBox="0 0 340 340" role="img">
        <title>Report signal globe</title>
        <path className="globe-sphere" d={spherePath ?? undefined} />
        <path className="globe-graticule" d={graticulePath ?? undefined} />
        {points.map((point) => {
          const projected = projection([point.longitude, point.latitude]);

          if (!projected) {
            return null;
          }

          return (
            <g key={point.id} transform={`translate(${projected[0]} ${projected[1]})`}>
              <circle className={`globe-point ${riskClass[point.risk]}`} r="6" />
              <circle className={`globe-point-ring ${riskClass[point.risk]}`} r="11" />
            </g>
          );
        })}
      </svg>
      <div className="globe-legend">
        {points.map((point) => (
          <div key={point.id} className="legend-row">
            <span className={`legend-dot ${riskClass[point.risk]}`} />
            <span>{point.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
