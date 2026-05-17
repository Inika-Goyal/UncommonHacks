"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Factory,
  Gauge,
  MapPinned,
  Newspaper,
  ScrollText,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { ScoreScrambler } from "@/components/score-scrambler";
import { VideoBackground } from "@/components/video-background";
import { WorldGlobe, type WorldGlobeHandle, type WorldGlobeScreenPosition } from "@/components/world-globe";
import { AGENT_LABELS, type AgentLifecycle, type AgentName, type StateUpdate } from "@/agents/types";
import type { MapPoint } from "@/lib/report-types";
import {
  DEFAULT_SWARM_STATE,
  type SwarmLogEntry,
  type SwarmState,
} from "@/components/swarm-status-panel";

const AGENT_ICONS: Record<AgentName, ReactNode> = {
  news: <Newspaper aria-hidden="true" size={16} />,
  watchlist: <ShieldCheck aria-hidden="true" size={16} />,
  supplier: <Factory aria-hidden="true" size={16} />,
  web_research: <Search aria-hidden="true" size={16} />,
  pipeline: <MapPinned aria-hidden="true" size={16} />,
  legal: <ScrollText aria-hidden="true" size={16} />,
  risk_index: <Gauge aria-hidden="true" size={16} />,
};

const STATUS_LABEL: Record<AgentLifecycle, string> = {
  pending: "Queued",
  running: "Running",
  ready: "Live",
  snapshot: "Live",
  blocked: "Blocked",
};

const AUTO_REDIRECT_MS = 14_000;
const GLOBE_SETTLE_MS = 1250;
const MAP_POINT_FLUSH_MS = 140;
const LAUNCH_IDLE_ZOOM = 1.6;
const LAUNCH_FOCUS_ZOOM = 1.61;
const EMPTY_MAP_POINTS: MapPoint[] = [];
const TERMINAL_AGENT_STATUSES = new Set<AgentLifecycle>(["ready", "snapshot", "blocked"]);

type ScanCity = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

const SCAN_CITIES: ScanCity[] = [
  {
    id: "london",
    label: "London",
    latitude: 51.5074,
    longitude: -0.1278,
  },
  {
    id: "paris",
    label: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    id: "washington-dc",
    label: "Washington DC",
    latitude: 38.9072,
    longitude: -77.0369,
  },
  {
    id: "boulder",
    label: "Boulder",
    latitude: 40.015,
    longitude: -105.2705,
  },
  {
    id: "bangladesh",
    label: "Bangladesh",
    latitude: 23.685,
    longitude: 90.3563,
  },
  {
    id: "jakarta",
    label: "Indonesia",
    latitude: -6.2088,
    longitude: 106.8456,
  },
  {
    id: "beijing",
    label: "Beijing",
    latitude: 39.9042,
    longitude: 116.4074,
  },
  {
    id: "ho-chi-minh-city",
    label: "Ho Chi Minh City",
    latitude: 10.8231,
    longitude: 106.6297,
  },
  {
    id: "lagos",
    label: "Lagos",
    latitude: 6.5244,
    longitude: 3.3792,
  },
  {
    id: "sao-paulo",
    label: "Sao Paulo",
    latitude: -23.5558,
    longitude: -46.6396,
  },
  {
    id: "mexico-city",
    label: "Mexico City",
    latitude: 19.4326,
    longitude: -99.1332,
  },
  {
    id: "nairobi",
    label: "Nairobi",
    latitude: -1.2921,
    longitude: 36.8219,
  },
  {
    id: "mumbai",
    label: "Mumbai",
    latitude: 19.076,
    longitude: 72.8777,
  },
  {
    id: "tokyo",
    label: "Tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
  },
  {
    id: "seoul",
    label: "Seoul",
    latitude: 37.5665,
    longitude: 126.978,
  },
  {
    id: "dubai",
    label: "Dubai",
    latitude: 25.2048,
    longitude: 55.2708,
  },
  {
    id: "cairo",
    label: "Cairo",
    latitude: 30.0444,
    longitude: 31.2357,
  },
  {
    id: "johannesburg",
    label: "Johannesburg",
    latitude: -26.2041,
    longitude: 28.0473,
  },
  {
    id: "casablanca",
    label: "Casablanca",
    latitude: 33.5731,
    longitude: -7.5898,
  },
  {
    id: "istanbul",
    label: "Istanbul",
    latitude: 41.0082,
    longitude: 28.9784,
  },
  {
    id: "berlin",
    label: "Berlin",
    latitude: 52.52,
    longitude: 13.405,
  },
  {
    id: "amsterdam",
    label: "Amsterdam",
    latitude: 52.3676,
    longitude: 4.9041,
  },
  {
    id: "madrid",
    label: "Madrid",
    latitude: 40.4168,
    longitude: -3.7038,
  },
  {
    id: "new-york",
    label: "New York",
    latitude: 40.7128,
    longitude: -74.006,
  },
  {
    id: "toronto",
    label: "Toronto",
    latitude: 43.6532,
    longitude: -79.3832,
  },
  {
    id: "vancouver",
    label: "Vancouver",
    latitude: 49.2827,
    longitude: -123.1207,
  },
  {
    id: "chicago",
    label: "Chicago",
    latitude: 41.8781,
    longitude: -87.6298,
  },
  {
    id: "seattle",
    label: "Seattle",
    latitude: 47.6062,
    longitude: -122.3321,
  },
  {
    id: "bogota",
    label: "Bogota",
    latitude: 4.711,
    longitude: -74.0721,
  },
  {
    id: "lima",
    label: "Lima",
    latitude: -12.0464,
    longitude: -77.0428,
  },
  {
    id: "buenos-aires",
    label: "Buenos Aires",
    latitude: -34.6037,
    longitude: -58.3816,
  },
  {
    id: "santiago",
    label: "Santiago",
    latitude: -33.4489,
    longitude: -70.6693,
  },
  {
    id: "sydney",
    label: "Sydney",
    latitude: -33.8688,
    longitude: 151.2093,
  },
  {
    id: "auckland",
    label: "Auckland",
    latitude: -36.8509,
    longitude: 174.7645,
  },
  {
    id: "manila",
    label: "Manila",
    latitude: 14.5995,
    longitude: 120.9842,
  },
  {
    id: "bangkok",
    label: "Bangkok",
    latitude: 13.7563,
    longitude: 100.5018,
  },
  {
    id: "addis-ababa",
    label: "Addis Ababa",
    latitude: 8.9806,
    longitude: 38.7578,
  },
  {
    id: "accra",
    label: "Accra",
    latitude: 5.6037,
    longitude: -0.187,
  },
];

function randomScanCityIndex(except?: number): number {
  if (SCAN_CITIES.length <= 1) return 0;
  let next = Math.floor(Math.random() * SCAN_CITIES.length);
  while (next === except) {
    next = Math.floor(Math.random() * SCAN_CITIES.length);
  }
  return next;
}

function scanCityToMapPoint(city: ScanCity): MapPoint {
  return {
    id: `scan-${city.id}`,
    label: city.label,
    latitude: city.latitude,
    longitude: city.longitude,
    risk: "medium",
    exploitType: "child_labor",
    severity: 3,
    stage: "transit",
    order: 0,
  };
}

const SCAN_MAP_POINTS = SCAN_CITIES.map(scanCityToMapPoint);

function incompleteAgents(swarm: SwarmState): AgentName[] {
  return (Object.keys(AGENT_LABELS) as AgentName[]).filter((agent) => !TERMINAL_AGENT_STATUSES.has(swarm[agent].status));
}

type Props = {
  reportId: string;
};

export function SwarmLaunch({ reportId }: Props) {
  const router = useRouter();
  const [swarm, setSwarm] = useState<SwarmState>(DEFAULT_SWARM_STATE);
  const [events, setEvents] = useState<SwarmLogEntry[]>([]);
  const [synthesis, setSynthesis] = useState<{ severity: number; credibility: number; overallRisk: number } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsToRedirect, setSecondsToRedirect] = useState<number | null>(null);
  const [globeReadyState, setGlobeReadyState] = useState({ reportId, ready: false });
  const [globeSettledState, setGlobeSettledState] = useState({ reportId, settled: false });
  const [scanCityIndex, setScanCityIndex] = useState(0);
  const [scanLabelPosition, setScanLabelPosition] = useState<WorldGlobeScreenPosition | null>(null);
  const [mapState, setMapState] = useState<{ reportId: string; points: MapPoint[] }>({
    reportId,
    points: [],
  });
  const launchGlobeRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<WorldGlobeHandle | null>(null);
  const swarmRef = useRef<SwarmState>(DEFAULT_SWARM_STATE);
  const mapPointIds = useRef<Set<string>>(new Set());
  const pendingMapPoints = useRef<MapPoint[]>([]);
  const hasFocusedFirstPoint = useRef(false);
  const mapPointFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleGlobeReady = useCallback(() => {
    setGlobeReadyState({ reportId, ready: true });
    setGlobeSettledState({ reportId, settled: false });
  }, [reportId]);

  const handleTrackedPointScreenPosition = useCallback((position: WorldGlobeScreenPosition | null) => {
    const globeBounds = launchGlobeRef.current?.getBoundingClientRect();
    if (!position || !globeBounds) {
      setScanLabelPosition(null);
      return;
    }
    setScanLabelPosition({
      x: position.x - globeBounds.left,
      y: position.y - globeBounds.top,
      visible: position.visible,
    });
  }, []);

  const flushMapPoints = useCallback(() => {
    if (mapPointFlushTimer.current) {
      clearTimeout(mapPointFlushTimer.current);
      mapPointFlushTimer.current = null;
    }
    const nextPoints = pendingMapPoints.current;
    pendingMapPoints.current = [];
    if (nextPoints.length === 0) return;
    setMapState((prev) => {
      const points = prev.reportId === reportId ? prev.points : [];
      return {
        reportId,
        points: [...points, ...nextPoints],
      };
    });
  }, [reportId]);

  useEffect(() => {
    swarmRef.current = DEFAULT_SWARM_STATE;
    mapPointIds.current.clear();
    pendingMapPoints.current = [];
    hasFocusedFirstPoint.current = false;
    if (mapPointFlushTimer.current) {
      clearTimeout(mapPointFlushTimer.current);
      mapPointFlushTimer.current = null;
    }

    const eventSource = new EventSource(`/api/reports/stream?id=${encodeURIComponent(reportId)}`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StateUpdate;
        if (payload.type === "agent") {
          const nextSwarm = {
            ...swarmRef.current,
            [payload.name as AgentName]: {
              status: payload.status,
              detail: payload.detail,
              findingCount: payload.findingCount,
            },
          };
          swarmRef.current = nextSwarm;
          setSwarm((prev) => ({
            ...prev,
            [payload.name as AgentName]: {
              status: payload.status,
              detail: payload.detail,
              findingCount: payload.findingCount,
            },
          }));
          if (payload.status !== "pending") {
            const verb =
              payload.status === "running"
                ? "started"
                : payload.status === "ready" || payload.status === "snapshot"
                  ? "completed"
                  : "blocked";
            setEvents((prev) => [
              ...prev,
              {
                ts: Date.now(),
                agent: payload.name as AgentName,
                status: payload.status,
                message: `${AGENT_LABELS[payload.name as AgentName]} ${verb}${
                  payload.detail ? ` — ${payload.detail}` : ""
                }`,
              },
            ]);
          }
        } else if (payload.type === "mappoint") {
          if (!mapPointIds.current.has(payload.point.id)) {
            mapPointIds.current.add(payload.point.id);
            const isFirstPoint = !hasFocusedFirstPoint.current;
            pendingMapPoints.current.push(payload.point);
            if (isFirstPoint) {
              hasFocusedFirstPoint.current = true;
              flushMapPoints();
              globeRef.current?.focusLocation({
                latitude: payload.point.latitude,
                longitude: payload.point.longitude,
                zoom: LAUNCH_FOCUS_ZOOM,
                spin: false,
              });
            } else if (!mapPointFlushTimer.current) {
              mapPointFlushTimer.current = setTimeout(() => {
                flushMapPoints();
              }, MAP_POINT_FLUSH_MS);
            }
          }
        } else if (payload.type === "synthesis") {
          setSynthesis({
            severity: payload.severity,
            credibility: payload.credibility,
            overallRisk: payload.overallRisk,
          });
          setEvents((prev) => [
            ...prev,
            {
              ts: Date.now(),
              message: `Synthesis: severity ${payload.severity}/5, credibility ${payload.credibility}/5, risk ${payload.overallRisk}/100`,
            },
          ]);
        } else if (payload.type === "done") {
          eventSource.close();
          const unfinished = incompleteAgents(swarmRef.current);
          if (unfinished.length === 0) {
            setError(null);
            setDone(true);
          } else {
            const names = unfinished.map((agent) => AGENT_LABELS[agent]).join(", ");
            setSecondsToRedirect(null);
            setError(`Report is not ready yet. Waiting on: ${names}.`);
            setEvents((prev) => [
              ...prev,
              {
                ts: Date.now(),
                message: `Report held: ${names} ${unfinished.length === 1 ? "has" : "have"} not completed.`,
              },
            ]);
          }
        } else if (payload.type === "error") {
          setError(payload.message);
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => {
      eventSource.close();
      if (mapPointFlushTimer.current) {
        clearTimeout(mapPointFlushTimer.current);
        mapPointFlushTimer.current = null;
      }
    };
  }, [flushMapPoints, reportId]);

  useEffect(() => {
    const globeReady = globeReadyState.reportId === reportId && globeReadyState.ready;
    if (!globeReady) return;
    const settleTimer = setTimeout(() => {
      setGlobeSettledState({ reportId, settled: true });
    }, GLOBE_SETTLE_MS);
    return () => clearTimeout(settleTimer);
  }, [globeReadyState, reportId]);

  useEffect(() => {
    if (mapState.reportId === reportId && mapState.points.length > 0) return;
    if (done) return;
    const scanInterval = setInterval(() => {
      setScanCityIndex((index) => randomScanCityIndex(index));
    }, 5200);
    return () => clearInterval(scanInterval);
  }, [done, mapState, reportId]);

  useEffect(() => {
    if (!globeReadyState.ready || globeReadyState.reportId !== reportId) return;
    if (mapState.reportId === reportId && mapState.points.length > 0) return;

    const city = SCAN_CITIES[scanCityIndex];
    globeRef.current?.focusLocation({
      latitude: city.latitude,
      longitude: city.longitude,
      zoom: LAUNCH_FOCUS_ZOOM,
      spin: false,
    });
  }, [globeReadyState, mapState, reportId, scanCityIndex]);

  // Auto-redirect to the dashboard a few seconds after the swarm finishes so
  // the user has time to read the scores before transitioning.
  useEffect(() => {
    if (!done) return;
    const startCountdown = setTimeout(() => {
      setSecondsToRedirect(Math.ceil(AUTO_REDIRECT_MS / 1000));
    }, 0);
    countdownInterval.current = setInterval(() => {
      setSecondsToRedirect((s) => (s !== null && s > 0 ? s - 1 : s));
    }, 1000);
    redirectTimer.current = setTimeout(() => {
      router.push(`/dashboard?id=${reportId}`);
    }, AUTO_REDIRECT_MS);
    return () => {
      clearTimeout(startCountdown);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [done, reportId, router]);

  const completedCount = useMemo(
    () =>
      (Object.keys(AGENT_LABELS) as AgentName[]).filter((a) =>
        ["ready", "snapshot", "blocked"].includes(swarm[a].status),
      ).length,
    [swarm],
  );
  const totalAgents = Object.keys(AGENT_LABELS).length;
  const progress = Math.min(1, completedCount / totalAgents);

  const recentEvents = events.slice(-6).reverse();
  const mapPoints = useMemo(
    () => (mapState.reportId === reportId ? mapState.points : EMPTY_MAP_POINTS),
    [mapState, reportId],
  );
  const scanCity = SCAN_CITIES[scanCityIndex];
  const trackedScanPointId = `scan-${scanCity.id}`;
  const globePoints = useMemo(
    () => (mapPoints.length > 0 ? mapPoints : SCAN_MAP_POINTS),
    [mapPoints],
  );
  const visiblePointIds = useMemo(
    () => (mapPoints.length > 0 ? undefined : [trackedScanPointId]),
    [mapPoints.length, trackedScanPointId],
  );
  const globeReady = globeReadyState.reportId === reportId && globeReadyState.ready;
  const globeSettled = globeSettledState.reportId === reportId && globeSettledState.settled;

  return (
    <main className="launch-page laborlens-shell">
      <VideoBackground />
      <div className="launch-backdrop" aria-hidden="true" />

      <section className="launch-stage">
        <div className="launch-titlebar">
          <p className="launch-eyebrow">Labour Exploitation Intelligence Platform</p>
          <h1 className="launch-title">
            {done ? "Evidence synthesis complete" : "Investigating public evidence"}
          </h1>
          <p className="launch-subtitle">
            Seven specialist agents are collecting source signals, reconciling citations, and
            assembling the risk brief that opens next.
          </p>
        </div>

        <div
          className="launch-visual-shell liquid-glass"
          data-globe-ready={globeReady ? "true" : "false"}
          data-globe-settled={globeSettled ? "true" : "false"}
        >
          <div className="launch-globe" ref={launchGlobeRef}>
            <WorldGlobe
              points={globePoints}
              visiblePointIds={visiblePointIds}
              trackedPointId={mapPoints.length > 0 ? null : trackedScanPointId}
              showPointArcs={mapPoints.length > 0}
              ref={globeRef}
              initialZoom={LAUNCH_IDLE_ZOOM}
              idleZoom={LAUNCH_IDLE_ZOOM}
              autoRotateWhileZoomed
              idleRotationSpeed={0.0002}
              showLoadingOverlay={false}
              showChrome={false}
              showFlowLegend={mapPoints.length > 1}
              interactive={false}
              onReady={handleGlobeReady}
              onTrackedPointScreenPosition={handleTrackedPointScreenPosition}
            />
            {mapPoints.length === 0 ? (
              <div className="launch-scan-overlay" aria-hidden="true">
                <span
                  key={scanCity.id}
                  className="launch-scan-label"
                  data-visible={scanLabelPosition?.visible ? "true" : "false"}
                  style={
                    scanLabelPosition
                      ? ({
                          "--scan-label-x": `${Math.round(scanLabelPosition.x)}px`,
                          "--scan-label-y": `${Math.round(scanLabelPosition.y)}px`,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  {scanCity.label}
                </span>
              </div>
            ) : null}
          </div>

          <div className="launch-progress" aria-hidden="true">
            <span className="launch-progress-bar" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <div className="launch-intel-grid">
          <ul className="launch-agents">
            {(Object.keys(AGENT_LABELS) as AgentName[]).map((name) => {
              const cell = swarm[name];
              const sc = cell.status === "snapshot" ? "ready" : cell.status;
              return (
                <li key={name} className={`launch-agent liquid-glass launch-agent-${sc}`}>
                  <span className="launch-agent-icon">{AGENT_ICONS[name]}</span>
                  <div className="launch-agent-body">
                    <strong>{AGENT_LABELS[name]}</strong>
                    <span className="launch-agent-detail">
                      {cell.detail ?? (cell.status === "pending" ? "Queued for collection" : "")}
                    </span>
                  </div>
                  <span className={`launch-agent-status launch-agent-status-${sc === "running" || sc === "pending" ? "running" : sc}`}>
                    {(cell.status === "running" || cell.status === "pending") && (
                      <Loader2 className="spin-icon" size={12} aria-hidden="true" />
                    )}
                    {(cell.status === "ready" || cell.status === "snapshot") && (
                      <CheckCircle2 size={12} aria-hidden="true" />
                    )}
                    {cell.status === "blocked" && <CircleSlash size={12} aria-hidden="true" />}
                    {STATUS_LABEL[cell.status]}
                  </span>
                </li>
              );
            })}
          </ul>

          <aside className="launch-sidecar">
            {synthesis ? (
              <div className={`launch-scores ${done ? "launch-scores-done" : ""}`}>
                <ScoreTile label="Overall risk" value={synthesis.overallRisk} suffix="/100" tone="danger" />
                <ScoreTile label="Severity" value={synthesis.severity} suffix="/5" tone="warning" />
                <ScoreTile label="Credibility" value={synthesis.credibility} suffix="/5" tone="info" />
              </div>
            ) : (
              <div className="launch-skeleton liquid-glass" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}

            <div className="launch-log liquid-glass" aria-live="polite">
              {recentEvents.length === 0 ? (
                <span className="launch-log-idle">Awaiting first orchestrator event</span>
              ) : (
                recentEvents.map((e) => (
                  <span key={`${e.ts}-${e.message}`} className="launch-log-row">
                    <span className="launch-log-time">
                      {new Date(e.ts).toLocaleTimeString(undefined, {
                        hour12: false,
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    {e.agent ? (
                      <span className="launch-log-agent">{AGENT_LABELS[e.agent]}</span>
                    ) : null}
                    <span className="launch-log-msg">{e.message}</span>
                  </span>
                ))
              )}
            </div>
          </aside>
        </div>

        <div
          className="launch-cta"
          data-visible={done ? "true" : "false"}
          aria-hidden={!done}
        >
          <Link
            className="launch-cta-button"
            href={`/dashboard?id=${reportId}`}
            tabIndex={done ? 0 : -1}
          >
            Open report
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          {done && secondsToRedirect !== null && secondsToRedirect > 0 ? (
            <span className="launch-cta-hint">
              Opening automatically in {secondsToRedirect}s
            </span>
          ) : null}
        </div>

        {error ? <div className="launch-error">{error}</div> : null}
      </section>
    </main>
  );
}

function ScoreTile({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix: string;
  tone: "danger" | "warning" | "info";
}) {
  return (
    <div className={`launch-score launch-score-${tone}`}>
      <span className="launch-score-label">{label}</span>
      <span className="launch-score-value">
        <ScoreScrambler value={value} />
        <span className="launch-score-suffix">{suffix}</span>
      </span>
    </div>
  );
}
