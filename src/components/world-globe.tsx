"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import * as THREE from "three";

import type { MapPoint } from "@/lib/report-types";

export type WorldGlobeProps = {
  points: MapPoint[];
};

export type WorldGlobePan = {
  x: number;
  y: number;
};

export type WorldGlobeRotation = {
  x?: number;
  y?: number;
};

export type WorldGlobeLocationTarget = {
  latitude: number;
  longitude: number;
  zoom?: number;
  pan?: WorldGlobePan;
};

export type WorldGlobeHandle = {
  zoomTo: (zoom: number) => void;
  panTo: (pan: WorldGlobePan) => void;
  rotateTo: (rotation: WorldGlobeRotation) => void;
  focusLocation: (target: WorldGlobeLocationTarget) => void;
  focusPoint: (pointId: string) => boolean;
  resetView: () => void;
  getView: () => {
    zoom: number;
    pan: WorldGlobePan;
    rotation: Required<WorldGlobeRotation>;
  };
};

type CountryFeature = {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties?: Record<string, unknown>;
};

type CountryFeatureCollection = {
  type: "FeatureCollection";
  features: CountryFeature[];
};

type GeographyState =
  | { status: "loading" }
  | { status: "ready"; features: CountryFeature[] }
  | { status: "error"; message: string };

type ArcLink = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
};

const GLOBE_RADIUS = 2.4;
const ARC_HEIGHT = 0.26;
const ARC_HEIGHT_MIN_FACTOR = 0.18;
const ARC_RADIUS = 0.006;
const ARC_SEGMENTS = 96;
const ARC_PULSE_WIDTH = 0.22;
const SURFACE_NORMAL = new THREE.Vector3(0, 0, 1);
const COUNTRY_GEOJSON_URL = "/data/ne_110m_admin_0_countries.geojson";
const MIN_ZOOM = 1;
const MAX_ZOOM = 1.65;
const MAX_PAN_OFFSET = 1.42;
const PAN_SENSITIVITY = 0.0062;
const WHEEL_ZOOM_SENSITIVITY = 0.0012;
const POINTER_ZOOM_PAN_SENSITIVITY = 1.05;

const DEMO_MAP_POINTS = [
  { id: "demo-intake", label: "Intake signal", latitude: 42.4, longitude: -38, risk: "low" },
  { id: "demo-supplier", label: "Supplier registry", latitude: 34.6, longitude: -12, risk: "medium" },
  { id: "demo-news", label: "News cluster", latitude: 43.4, longitude: 8, risk: "low" },
  { id: "demo-legal", label: "Legal watchlist", latitude: 31.1, longitude: 31, risk: "high" },
  { id: "demo-brief", label: "Brief output", latitude: 40.1, longitude: 47, risk: "medium" },
] satisfies MapPoint[];

const riskColor = {
  high: "#ec4899",
  medium: "#a78bfa",
  low: "#38bdf8",
} satisfies Record<MapPoint["risk"], string>;

const riskLabel = {
  high: "High",
  medium: "Medium",
  low: "Low",
} satisfies Record<MapPoint["risk"], string>;

const ARC_GRADIENT: readonly string[] = ["#38bdf8", "#a855f7", "#ec4899"];

function gradientColorAt(t: number): THREE.Color {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  if (clamped <= 0.5) {
    return new THREE.Color(ARC_GRADIENT[0]).lerp(new THREE.Color(ARC_GRADIENT[1]), clamped * 2);
  }
  return new THREE.Color(ARC_GRADIENT[1]).lerp(new THREE.Color(ARC_GRADIENT[2]), (clamped - 0.5) * 2);
}

function gradientHexAt(t: number): string {
  return `#${gradientColorAt(t).getHexString()}`;
}

const RAY_VERTEX_SHADER = `
  varying float vT;
  void main() {
    vT = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RAY_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uFalloff;
  uniform float uPulse;
  uniform float uTravel;
  uniform float uTravelWidth;
  varying float vT;
  void main() {
    float fade = pow(1.0 - vT, uFalloff);
    float travelDist = abs(vT - uTravel);
    float travelBump = smoothstep(uTravelWidth, 0.0, travelDist) * (1.0 - clamp(vT, 0.0, 1.0)) * 0.9;
    float alpha = (fade + travelBump) * uIntensity * uPulse;
    vec3 hot = mix(uColor, vec3(1.0), pow(1.0 - vT, 6.0) * 0.45 + travelBump * 0.7);
    gl_FragColor = vec4(hot, alpha);
  }
`;

function isCountryFeatureCollection(value: unknown): value is CountryFeatureCollection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CountryFeatureCollection>;
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

function latLngToVector3(latitude: number, longitude: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function rotationForLocation(latitude: number, longitude: number): Required<WorldGlobeRotation> {
  return {
    x: THREE.MathUtils.clamp(THREE.MathUtils.degToRad(latitude * 0.72), -0.9, 0.9),
    y: THREE.MathUtils.degToRad(-longitude - 90),
  };
}

function clampPan(pan: WorldGlobePan): WorldGlobePan {
  return {
    x: THREE.MathUtils.clamp(pan.x, -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
    y: THREE.MathUtils.clamp(pan.y, -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
  };
}

function makeArcLinks(points: readonly MapPoint[]): ArcLink[] {
  if (points.length < 2) {
    return [];
  }

  const links: ArcLink[] = [];
  const segments = points.length - 1;
  for (let index = 0; index < segments; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const t0 = index / segments;
    const t1 = (index + 1) / segments;
    links.push({
      startLat: from.latitude,
      startLng: from.longitude,
      endLat: to.latitude,
      endLng: to.longitude,
      color: [gradientHexAt(t0), gradientHexAt(t1)],
    });
  }
  return links;
}

function makeArcPoints(link: ArcLink) {
  const start = latLngToVector3(link.startLat, link.startLng, GLOBE_RADIUS);
  const end = latLngToVector3(link.endLat, link.endLng, GLOBE_RADIUS);
  const chord = start.distanceTo(end);
  const chordRatio = THREE.MathUtils.clamp(chord / (2 * GLOBE_RADIUS), 0, 1);
  const heightFactor = ARC_HEIGHT_MIN_FACTOR + Math.sqrt(chordRatio) * (1 - ARC_HEIGHT_MIN_FACTOR);
  const arcHeight = ARC_HEIGHT * heightFactor;
  const arcPoints: THREE.Vector3[] = [];

  for (let index = 0; index <= ARC_SEGMENTS; index += 1) {
    const t = index / ARC_SEGMENTS;
    const normal = start.clone().lerp(end, t).normalize();
    const altitude = GLOBE_RADIUS + Math.sin(Math.PI * t) * arcHeight;
    arcPoints.push(normal.multiplyScalar(altitude));
  }

  return arcPoints;
}

const ARC_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARC_FRAGMENT_SHADER = `
  uniform vec3 uStartColor;
  uniform vec3 uEndColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uShimmerPhase;
  varying vec2 vUv;
  void main() {
    vec3 color = mix(uStartColor, uEndColor, smoothstep(0.0, 1.0, vUv.x));
    float shimmer = sin(vUv.x * 18.0 - uTime * 1.6 + uShimmerPhase) * 0.5 + 0.5;
    float edgeFade = sin(vUv.x * 3.14159);
    float modulated = uOpacity * (0.62 + shimmer * 0.38) * mix(0.55, 1.0, edgeFade);
    gl_FragColor = vec4(color * (0.85 + shimmer * 0.25), modulated);
  }
`;

const ARC_PULSE_FRAGMENT_SHADER = `
  uniform vec3 uStartColor;
  uniform vec3 uEndColor;
  uniform float uProgress;
  uniform float uWidth;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float distanceFromPulse = abs(vUv.x - uProgress);
    float core = smoothstep(uWidth, 0.0, distanceFromPulse);
    float tail = smoothstep(uWidth * 2.4, 0.0, distanceFromPulse) * 0.34;
    float comet = smoothstep(uWidth * 0.6, 0.0, vUv.x - uProgress) * step(0.0, vUv.x - uProgress) * 0.45;
    float alpha = (core + tail + comet) * uIntensity;
    vec3 color = mix(uStartColor, uEndColor, smoothstep(0.0, 1.0, vUv.x));
    vec3 hot = mix(color, vec3(1.0), core * 0.55);
    gl_FragColor = vec4(hot, alpha);
  }
`;

function makeArcMaterial([startColor, endColor]: [string, string], shimmerPhase: number, opacity = 0.85) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uStartColor: { value: new THREE.Color(startColor) },
      uEndColor: { value: new THREE.Color(endColor) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uShimmerPhase: { value: shimmerPhase },
    },
    vertexShader: ARC_VERTEX_SHADER,
    fragmentShader: ARC_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return material;
}

function makeArcPulseMaterial(
  [startColor, endColor]: [string, string],
  phase: number,
  speed: number,
  width: number,
  intensity: number,
) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uStartColor: { value: new THREE.Color(startColor) },
      uEndColor: { value: new THREE.Color(endColor) },
      uProgress: { value: -width },
      uWidth: { value: width },
      uIntensity: { value: intensity },
    },
    vertexShader: ARC_VERTEX_SHADER,
    fragmentShader: ARC_PULSE_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.userData.phase = phase;
  material.userData.speed = speed;
  material.userData.width = width;
  return material;
}

function makeSignalArc(link: ArcLink, arcIndex: number) {
  const group = new THREE.Group();
  const pulseMaterials: THREE.ShaderMaterial[] = [];
  const points = makeArcPoints(link);
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeSegments = points.length * 2;
  const baseMaterial = makeArcMaterial(link.color, arcIndex * 0.7);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, tubeSegments, ARC_RADIUS, 8, false), baseMaterial);
  mesh.renderOrder = 5;
  group.add(mesh);

  // 2-3 pulses per arc, each with varied speed, width, intensity, and phase
  const pulseCount = 2 + (arcIndex % 2);
  for (let pulseIndex = 0; pulseIndex < pulseCount; pulseIndex += 1) {
    const phase = (arcIndex * 0.31 + pulseIndex / pulseCount) % 1;
    const speed = 0.75 + ((arcIndex * 7 + pulseIndex * 11) % 9) * 0.06;
    const width = ARC_PULSE_WIDTH * (0.75 + pulseIndex * 0.22);
    const intensity = 0.92 - pulseIndex * 0.18;
    const pulseMaterial = makeArcPulseMaterial(link.color, phase, speed, width, intensity);
    const pulse = new THREE.Mesh(
      new THREE.TubeGeometry(curve, tubeSegments, ARC_RADIUS * (1.9 + pulseIndex * 0.55), 8, false),
      pulseMaterial,
    );
    pulse.renderOrder = 7 + pulseIndex;
    group.add(pulse);
    pulseMaterials.push(pulseMaterial);
  }

  return { group, pulseMaterials, baseMaterial };
}

function styleThinGlobeLines(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.LineSegments)) {
      return;
    }

    const material = child.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => {
        if (entry instanceof THREE.LineBasicMaterial) {
          entry.color.set("#60a5fa");
          entry.opacity = 0.22;
          entry.transparent = true;
        }
      });
      return;
    }

    if (material instanceof THREE.LineBasicMaterial) {
      material.color.set("#60a5fa");
      material.opacity = 0.22;
      material.transparent = true;
    }
  });
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function canCreateWebGLContext() {
  const canvas = document.createElement("canvas");
  const attributes: WebGLContextAttributes = {};
  const context = (canvas.getContext("webgl2", attributes) ??
    canvas.getContext("webgl", attributes) ??
    canvas.getContext("experimental-webgl", attributes)) as WebGLRenderingContext | WebGL2RenderingContext | null;

  if (!context) {
    return false;
  }

  const loseContext = context.getExtension("WEBGL_lose_context");
  loseContext?.loseContext();
  return true;
}

export const WorldGlobe = forwardRef<WorldGlobeHandle, WorldGlobeProps>(function WorldGlobe({ points }, ref) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const zoomLevelRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const rotationTargetRef = useRef<Required<WorldGlobeRotation> | null>(null);
  const currentRotationRef = useRef<Required<WorldGlobeRotation>>({ x: 0, y: 0 });
  const [selectedPointId, setSelectedPointId] = useState(points[0]?.id ?? "");
  const [showDemoNetwork, setShowDemoNetwork] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [geographyState, setGeographyState] = useState<GeographyState>({ status: "loading" });
  const [rendererError, setRendererError] = useState<string | null>(null);

  const activePoints = useMemo(() => (showDemoNetwork ? DEMO_MAP_POINTS : points), [points, showDemoNetwork]);

  const selectedPoint = useMemo(
    () => activePoints.find((point) => point.id === selectedPointId) ?? activePoints[0],
    [activePoints, selectedPointId],
  );

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  const zoomPercent = Math.round(zoomLevel * 100);

  const setPan = useCallback((pan: WorldGlobePan) => {
    panOffsetRef.current = clampPan(pan);
  }, []);

  const setZoom = useCallback((nextZoom: number, options?: { keepPan?: boolean }) => {
    const clampedZoom = THREE.MathUtils.clamp(Number(nextZoom.toFixed(2)), MIN_ZOOM, MAX_ZOOM);
    zoomLevelRef.current = clampedZoom;
    if (clampedZoom <= MIN_ZOOM && !options?.keepPan) {
      setPan({ x: 0, y: 0 });
    }
    setZoomLevel(clampedZoom);
  }, [setPan]);

  function changeZoom(delta: number) {
    setZoom(zoomLevelRef.current + delta);
  }

  function resetGlobeView() {
    setPan({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    if (activePoints[0]) {
      rotationTargetRef.current = rotationForLocation(activePoints[0].latitude, activePoints[0].longitude);
    }
  }

  function handleDemoNetworkToggle(checked: boolean) {
    setShowDemoNetwork(checked);
    const nextPoints = checked ? DEMO_MAP_POINTS : points;
    setSelectedPointId(nextPoints[0]?.id ?? "");
  }

  useImperativeHandle(
    ref,
    () => ({
      zoomTo: setZoom,
      panTo: setPan,
      rotateTo: (rotation) => {
        rotationTargetRef.current = {
          x: rotation.x ?? currentRotationRef.current.x,
          y: rotation.y ?? currentRotationRef.current.y,
        };
      },
      focusLocation: (target) => {
        rotationTargetRef.current = rotationForLocation(target.latitude, target.longitude);
        if (typeof target.zoom === "number") {
          setZoom(target.zoom);
        }
        if (target.pan) {
          setPan(target.pan);
        }
      },
      focusPoint: (pointId) => {
        const reportPoint = points.find((candidate) => candidate.id === pointId);
        const point = reportPoint ?? activePoints.find((candidate) => candidate.id === pointId);
        if (!point) {
          return false;
        }
        if (reportPoint) {
          setShowDemoNetwork(false);
        }
        setSelectedPointId(point.id);
        rotationTargetRef.current = rotationForLocation(point.latitude, point.longitude);
        setZoom(Math.max(1.32, zoomLevelRef.current), { keepPan: true });
        return true;
      },
      resetView: resetGlobeView,
      getView: () => ({
        zoom: zoomLevelRef.current,
        pan: panOffsetRef.current,
        rotation: currentRotationRef.current,
      }),
    }),
  );

  useEffect(() => {
    let isActive = true;

    async function loadGeography() {
      try {
        const response = await fetch(COUNTRY_GEOJSON_URL);

        if (!response.ok) {
          throw new Error(`Country geometry request failed with ${response.status}.`);
        }

        const payload: unknown = await response.json();

        if (!isCountryFeatureCollection(payload)) {
          throw new Error("Country geometry asset is not a valid GeoJSON FeatureCollection.");
        }

        if (isActive) {
          setGeographyState({ status: "ready", features: payload.features });
        }
      } catch (error) {
        if (isActive) {
          setGeographyState({
            status: "error",
            message: error instanceof Error ? error.message : "Country geometry asset could not be loaded.",
          });
        }
      }
    }

    loadGeography();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount || geographyState.status !== "ready") {
      return;
    }

    const mountElement = mount;
    const countryFeatures = geographyState.features;
    let isDisposed = false;
    let disposeScene: (() => void) | undefined;

    async function setupScene() {
      setRendererError(null);

      if (!canCreateWebGLContext()) {
        setRendererError("3D globe unavailable because WebGL is disabled in this browser context.");
        return;
      }

      const { default: ThreeGlobe } = await import("three-globe");

      if (isDisposed) {
        return;
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.2, 8.6);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch {
      setRendererError("3D globe unavailable because WebGL could not be initialized.");
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountElement.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const globeMaterial = new THREE.MeshPhongMaterial({
      color: "#091a4a",
      emissive: "#0b2a6b",
      emissiveIntensity: 0.48,
      shininess: 6,
      specular: "#1e3a8a",
      transparent: true,
      opacity: 0.98,
    });

    const globe = new ThreeGlobe({ animateIn: false, waitForGlobeReady: false })
      .showGlobe(true)
      .showGraticules(true)
      .showAtmosphere(true)
      .atmosphereColor("#22d3ee")
      .atmosphereAltitude(0.28)
      .globeCurvatureResolution(3)
      .globeMaterial(globeMaterial)
      .polygonsData(countryFeatures)
      .polygonCapColor(() => "#1b2367")
      .polygonSideColor(() => "rgba(56, 189, 248, 0.22)")
      .polygonStrokeColor(() => "#38bdf8")
      .polygonAltitude(0.006)
      .polygonCapCurvatureResolution(2)
      .polygonsTransitionDuration(0);

    globe.scale.setScalar(GLOBE_RADIUS / globe.getGlobeRadius());
    styleThinGlobeLines(globe);
    globeGroup.add(globe);

    const arcGroup = new THREE.Group();
    const arcPulseMaterials: THREE.ShaderMaterial[] = [];
    const arcBaseMaterials: THREE.ShaderMaterial[] = [];
    makeArcLinks(activePoints).forEach((link, index) => {
      const signalArc = makeSignalArc(link, index);
      arcGroup.add(signalArc.group);
      arcPulseMaterials.push(...signalArc.pulseMaterials);
      arcBaseMaterials.push(signalArc.baseMaterial);
    });
    globeGroup.add(arcGroup);

    scene.add(new THREE.AmbientLight("#312e81", 0.85));
    const keyLight = new THREE.DirectionalLight("#a5b4fc", 1.35);
    keyLight.position.set(-3.2, 2.6, 4.4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight("#c084fc", 0.95);
    rimLight.position.set(3.6, -1.2, -2.6);
    scene.add(rimLight);
    const fillLight = new THREE.HemisphereLight("#60a5fa", "#0b0a1f", 0.4);
    scene.add(fillLight);

    const pinGroup = new THREE.Group();
    globeGroup.add(pinGroup);
    const pinMeshes: THREE.Object3D[] = [];
    const pinPulseRings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
    const pinRayMaterials: THREE.ShaderMaterial[] = [];
    const pinBaseGlows: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
    const pinTips: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];

    const beamSpec = {
      high: { length: 0.78, coreWidth: 0.004, glowWidth: 0.016, ringRadius: 0.022, ringCount: 4, pulseSpeed: 0.00058, travelSpeed: 0.55 },
      medium: { length: 0.6, coreWidth: 0.0034, glowWidth: 0.013, ringRadius: 0.019, ringCount: 3, pulseSpeed: 0.00045, travelSpeed: 0.45 },
      low: { length: 0.46, coreWidth: 0.003, glowWidth: 0.011, ringRadius: 0.016, ringCount: 2, pulseSpeed: 0.00034, travelSpeed: 0.38 },
    } satisfies Record<MapPoint["risk"], { length: number; coreWidth: number; glowWidth: number; ringRadius: number; ringCount: number; pulseSpeed: number; travelSpeed: number }>;

    for (const [pointIndex, point] of activePoints.entries()) {
      const surface = latLngToVector3(point.latitude, point.longitude, GLOBE_RADIUS);
      const color = new THREE.Color(riskColor[point.risk]);
      const spec = beamSpec[point.risk];

      const pin = new THREE.Group();
      pin.userData.pointId = point.id;
      pin.position.copy(surface);
      pin.quaternion.setFromUnitVectors(SURFACE_NORMAL, surface.clone().normalize());

      // Ray emerging from the surface — narrow bright core fading upward into space,
      // with a traveling spark that climbs and dies near the top.
      const coreMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color.clone() },
          uIntensity: { value: 1.05 },
          uFalloff: { value: 3.2 },
          uPulse: { value: 1.0 },
          uTravel: { value: -0.2 },
          uTravelWidth: { value: 0.18 },
        },
        vertexShader: RAY_VERTEX_SHADER,
        fragmentShader: RAY_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      coreMaterial.userData.phase = pointIndex * 0.41;
      coreMaterial.userData.baseIntensity = 1.05;
      coreMaterial.userData.risk = point.risk;
      coreMaterial.userData.travelSpeed = spec.travelSpeed;
      coreMaterial.userData.travelOffset = pointIndex * 0.37;
      const rayCore = new THREE.Mesh(
        new THREE.ConeGeometry(spec.coreWidth, spec.length, 12, 1, true),
        coreMaterial,
      );
      rayCore.rotation.x = Math.PI / 2;
      rayCore.position.z = spec.length / 2;
      rayCore.renderOrder = 7;

      // Outer halo cone — wider, dimmer, slower fade so the beam reads softly from far away.
      const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color.clone() },
          uIntensity: { value: 0.42 },
          uFalloff: { value: 1.9 },
          uPulse: { value: 1.0 },
          uTravel: { value: -0.2 },
          uTravelWidth: { value: 0.26 },
        },
        vertexShader: RAY_VERTEX_SHADER,
        fragmentShader: RAY_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      glowMaterial.userData.phase = pointIndex * 0.31;
      glowMaterial.userData.baseIntensity = 0.42;
      glowMaterial.userData.risk = point.risk;
      glowMaterial.userData.travelSpeed = spec.travelSpeed * 0.85;
      glowMaterial.userData.travelOffset = pointIndex * 0.37 + 0.12;
      const rayGlow = new THREE.Mesh(
        new THREE.ConeGeometry(spec.glowWidth, spec.length * 0.96, 14, 1, true),
        glowMaterial,
      );
      rayGlow.rotation.x = Math.PI / 2;
      rayGlow.position.z = (spec.length * 0.96) / 2;
      rayGlow.renderOrder = 5;

      // Tip indicator — small bright disc right at the location so the surface point reads clearly.
      const tip = new THREE.Mesh(
        new THREE.CircleGeometry(spec.glowWidth * 0.55, 24),
        new THREE.MeshBasicMaterial({
          color: color.clone(),
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      tip.position.z = 0.0012;
      tip.userData.phase = pointIndex * 0.53;
      tip.renderOrder = 8;

      const baseRing = new THREE.Mesh(
        new THREE.TorusGeometry(spec.ringRadius, 0.0034, 12, 56),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      baseRing.position.z = 0.0014;

      const baseGlow = new THREE.Mesh(
        new THREE.CircleGeometry(spec.ringRadius * 1.85, 40),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      baseGlow.position.z = 0.0007;
      baseGlow.userData.phase = pointIndex * 0.37;

      const pulseRings = Array.from({ length: spec.ringCount }).map((_, ringIndex) => {
        const pulseRing = new THREE.Mesh(
          new THREE.TorusGeometry(spec.ringRadius * 1.02, 0.0022, 10, 48),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.32,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        pulseRing.position.z = 0.0018 + ringIndex * 0.0006;
        pulseRing.userData.phase = (pointIndex * 0.23 + ringIndex / spec.ringCount) % 1;
        pulseRing.userData.speed = spec.pulseSpeed;
        pulseRing.userData.maxScale = 2.2 + ringIndex * 0.35;
        return pulseRing;
      });

      pin.add(baseGlow);
      pin.add(baseRing);
      pulseRings.forEach((pulseRing) => pin.add(pulseRing));
      pin.add(rayGlow);
      pin.add(rayCore);
      pin.add(tip);
      pinGroup.add(pin);

      pinMeshes.push(pin);
      pinPulseRings.push(...pulseRings);
      pinRayMaterials.push(coreMaterial, glowMaterial);
      pinBaseGlows.push(baseGlow);
      pinTips.push(tip);
    }

    if (activePoints[0]) {
      const initialRotation = rotationForLocation(activePoints[0].latitude, activePoints[0].longitude);
      globeGroup.rotation.x = initialRotation.x;
      globeGroup.rotation.y = initialRotation.y;
      currentRotationRef.current = initialRotation;
      rotationTargetRef.current = initialRotation;
    }

    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(520 * 3);
    for (let index = 0; index < 520; index += 1) {
      const radius = 17 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[index * 3 + 1] = radius * Math.cos(phi);
      starPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: "#c7d2fe",
        size: 0.018,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(stars);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let frameId = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startRotationX = 0;
    let startRotationY = 0;
    let startPanX = 0;
    let startPanY = 0;
    let dragMode: "rotate" | "pan" = "rotate";
    const rotationVelocity = new THREE.Vector2(0, 0.00028);

    const resize = () => {
      const { width, height } = mountElement.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mountElement);
    resize();

    const selectFromPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pinMeshes, true);
      const hit = hits.find((entry) => {
        let object: THREE.Object3D | null = entry.object;
        while (object) {
          if (object.userData.pointId) {
            return true;
          }
          object = object.parent;
        }
        return false;
      });

      if (!hit) {
        return;
      }

      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.pointId) {
        object = object.parent;
      }

      if (object?.userData.pointId) {
        setSelectedPointId(object.userData.pointId);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
      }
      isDragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      startRotationX = globeGroup.rotation.x;
      startRotationY = globeGroup.rotation.y;
      startPanX = panOffsetRef.current.x;
      startPanY = panOffsetRef.current.y;
      dragMode = event.metaKey || event.ctrlKey ? "pan" : "rotate";
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) {
        return;
      }

      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (dragMode === "pan" || event.metaKey || event.ctrlKey) {
        setPan({
          x: THREE.MathUtils.clamp(startPanX - dx * PAN_SENSITIVITY, -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
          y: THREE.MathUtils.clamp(startPanY + dy * PAN_SENSITIVITY, -MAX_PAN_OFFSET, MAX_PAN_OFFSET),
        });
        rotationVelocity.set(0, 0);
        return;
      }

      globeGroup.rotation.y = startRotationY + dx * 0.006;
      globeGroup.rotation.x = THREE.MathUtils.clamp(startRotationX + dy * 0.004, -0.9, 0.9);
      rotationTargetRef.current = {
        x: globeGroup.rotation.x,
        y: globeGroup.rotation.y,
      };
      currentRotationRef.current = {
        x: globeGroup.rotation.x,
        y: globeGroup.rotation.y,
      };
      rotationVelocity.set(dy * 0.00005, dx * 0.00008);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const moved = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY);
      isDragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);

      if (moved < 8) {
        selectFromPointer(event);
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const oldZoom = zoomLevelRef.current;
      const nextZoom = THREE.MathUtils.clamp(
        oldZoom - event.deltaY * WHEEL_ZOOM_SENSITIVITY,
        MIN_ZOOM,
        MAX_ZOOM,
      );
      if (nextZoom === oldZoom) {
        return;
      }

      const bounds = renderer.domElement.getBoundingClientRect();
      const pointerX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2;
      const pointerY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2;
      const zoomDelta = nextZoom - oldZoom;
      const nextPan = clampPan({
        x: panOffsetRef.current.x + pointerX * zoomDelta * POINTER_ZOOM_PAN_SENSITIVITY,
        y: panOffsetRef.current.y - pointerY * zoomDelta * POINTER_ZOOM_PAN_SENSITIVITY,
      });

      setPan(nextPan);
      setZoom(nextZoom, { keepPan: true });
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderer.domElement.addEventListener("contextmenu", handleContextMenu);

    const animate = () => {
      const zoomAmount = (zoomLevelRef.current - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
      const targetCameraDistance = THREE.MathUtils.lerp(8.6, 5.45, zoomAmount);
      const panInfluence = 0.55 + zoomAmount * 0.8;
      const targetCameraX = panOffsetRef.current.x * panInfluence;
      const targetCameraY = 0.2 + panOffsetRef.current.y * panInfluence;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCameraX, 0.14);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCameraY, 0.14);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCameraDistance, 0.12);

      if (!isDragging && rotationTargetRef.current) {
        globeGroup.rotation.x = THREE.MathUtils.lerp(globeGroup.rotation.x, rotationTargetRef.current.x, 0.1);
        globeGroup.rotation.y = THREE.MathUtils.lerp(globeGroup.rotation.y, rotationTargetRef.current.y, 0.1);
        if (
          Math.abs(globeGroup.rotation.x - rotationTargetRef.current.x) < 0.0006 &&
          Math.abs(globeGroup.rotation.y - rotationTargetRef.current.y) < 0.0006
        ) {
          globeGroup.rotation.x = rotationTargetRef.current.x;
          globeGroup.rotation.y = rotationTargetRef.current.y;
          rotationTargetRef.current = null;
        }
      } else if (!isDragging && !reducedMotion && zoomLevelRef.current <= MIN_ZOOM + 0.02) {
        globeGroup.rotation.y += rotationVelocity.y;
        globeGroup.rotation.x += rotationVelocity.x;
        rotationVelocity.multiplyScalar(0.992);
        rotationVelocity.y = Math.max(rotationVelocity.y, 0.00028);
      }
      currentRotationRef.current = {
        x: globeGroup.rotation.x,
        y: globeGroup.rotation.y,
      };

      if (!reducedMotion) {
        stars.rotation.y += 0.00018;
        const now = performance.now();
        const seconds = now * 0.001;

        arcBaseMaterials.forEach((material, index) => {
          material.uniforms.uTime.value = seconds + index * 0.4;
        });

        arcPulseMaterials.forEach((material) => {
          const phase = material.userData.phase as number;
          const speed = material.userData.speed as number;
          const width = material.userData.width as number;
          material.uniforms.uProgress.value = ((seconds * 0.22 * speed + phase) % 1.45) - width;
        });

        pinPulseRings.forEach((ring) => {
          const speed = (ring.userData.speed as number) ?? 0.00045;
          const maxScale = (ring.userData.maxScale as number) ?? 1.72;
          const phase = (now * speed + (ring.userData.phase as number)) % 1;
          const eased = phase * phase;
          const scale = 1 + eased * (maxScale - 1);
          ring.scale.setScalar(scale);
          ring.material.opacity = Math.pow(1 - phase, 1.6) * 0.42;
        });

        pinRayMaterials.forEach((material) => {
          const phase = material.userData.phase as number;
          const risk = material.userData.risk as MapPoint["risk"];
          const baseIntensity = material.userData.baseIntensity as number;
          const travelSpeed = material.userData.travelSpeed as number;
          const travelOffset = material.userData.travelOffset as number;
          const beatSpeed = risk === "high" ? 2.6 : risk === "medium" ? 1.9 : 1.4;
          const beat = (Math.sin(seconds * beatSpeed + phase) + 1) * 0.5;
          material.uniforms.uPulse.value = 0.72 + beat * 0.42;
          material.uniforms.uIntensity.value =
            baseIntensity * (0.85 + Math.sin(seconds * 0.9 + phase) * 0.15);
          // Traveling spark climbs from below the base (-0.2) up past the tip (1.2),
          // then wraps. Overshoot keeps a gap so the launch reads as a fresh shot.
          const cycleLength = 1.4;
          const travel = ((seconds * travelSpeed + travelOffset) % cycleLength) / cycleLength;
          material.uniforms.uTravel.value = travel * 1.4 - 0.2;
        });

        pinTips.forEach((tip) => {
          const phase = tip.userData.phase as number;
          const beat = (Math.sin(seconds * 3.2 + phase) + 1) * 0.5;
          tip.material.opacity = 0.65 + beat * 0.35;
          const tipScale = 0.85 + beat * 0.4;
          tip.scale.set(tipScale, tipScale, 1);
        });

        pinBaseGlows.forEach((glow) => {
          const phase = glow.userData.phase as number;
          const pulse = (Math.sin(seconds * 1.4 + phase) + 1) * 0.5;
          glow.material.opacity = 0.16 + pulse * 0.18;
          glow.scale.setScalar(0.9 + pulse * 0.3);
        });
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    disposeScene = () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu);
      globe._destructor();
      globeMaterial.dispose();
      disposeObject(arcGroup);
      disposeObject(pinGroup);
      starsGeometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };

    if (isDisposed) {
      disposeScene();
    }
  }

    void setupScene().catch((error) => {
      if (!isDisposed) {
        setGeographyState({
          status: "error",
          message: error instanceof Error ? error.message : "Globe renderer could not be initialized.",
        });
      }
    });

    return () => {
      isDisposed = true;
      disposeScene?.();
    };
  }, [activePoints, geographyState, setPan, setZoom]);

  return (
    <div className="globe-stage" aria-label="3D geographic report signals">
      <div
        ref={mountRef}
        className={rendererError ? "globe-canvas globe-canvas-unavailable" : "globe-canvas"}
        role="img"
        aria-label="Rotating globe with risk pins"
      />
      <div className="globe-overlay globe-overlay-top">
        <span>Supply-chain footprint</span>
        <strong>{activePoints.length} mapped signals</strong>
      </div>
      <div className="globe-controls" aria-label="Signal map controls">
        <label className="globe-switch">
          <input
            type="checkbox"
            checked={showDemoNetwork}
            onChange={(event) => handleDemoNetworkToggle(event.target.checked)}
          />
          <span className="globe-switch-track" aria-hidden="true">
            <span className="globe-switch-thumb" />
          </span>
          <span>Demo links</span>
        </label>
        <div className="globe-zoom-control" aria-label="Globe zoom">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => changeZoom(-0.1)}
            disabled={zoomLevel <= MIN_ZOOM}
          >
            <Minus aria-hidden="true" size={14} />
          </button>
          <input
            aria-label="Zoom level"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoomLevel}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => changeZoom(0.1)}
            disabled={zoomLevel >= MAX_ZOOM}
          >
            <Plus aria-hidden="true" size={14} />
          </button>
          <button type="button" aria-label="Reset globe view" title="Reset globe view" onClick={resetGlobeView}>
            <RotateCcw aria-hidden="true" size={14} />
          </button>
          <span>{zoomPercent}%</span>
        </div>
      </div>
      {geographyState.status === "loading" ? (
        <div className="globe-overlay globe-asset-state" aria-live="polite">
          <span>Loading map geometry</span>
          <strong>Preparing globe</strong>
        </div>
      ) : null}
      {geographyState.status === "error" ? (
        <div className="globe-overlay globe-asset-state globe-error" role="alert">
          <span>Map asset failed</span>
          <strong>{geographyState.message}</strong>
        </div>
      ) : null}
      {rendererError ? (
        <div className="globe-overlay globe-asset-state globe-error" role="status">
          <span>3D map unavailable</span>
          <strong>{rendererError}</strong>
        </div>
      ) : null}
      {selectedPoint ? (
        <div className="globe-overlay globe-selected">
          <span className={`globe-risk globe-risk-${selectedPoint.risk}`}>{riskLabel[selectedPoint.risk]} risk</span>
          <strong>{selectedPoint.label}</strong>
          <small>
            {selectedPoint.latitude.toFixed(2)}, {selectedPoint.longitude.toFixed(2)}
          </small>
        </div>
      ) : null}
      <div className="globe-legend" aria-label="Mapped risk points">
        {activePoints.map((point) => (
          <button
            key={point.id}
            className={point.id === selectedPoint?.id ? "legend-row legend-row-active" : "legend-row"}
            type="button"
            data-map-point-id={point.id}
            onClick={() => setSelectedPointId(point.id)}
          >
            <span className={`legend-dot globe-risk-${point.risk}`} />
            <span>{point.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
