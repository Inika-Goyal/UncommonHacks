"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { MapPoint } from "@/lib/report-types";

type WorldGlobeProps = {
  points: MapPoint[];
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
const COUNTRY_GEOJSON_URL = "/data/ne_110m_admin_0_countries.geojson";

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

function makeArcLinks(points: MapPoint[]): ArcLink[] {
  if (points.length < 2) {
    return [];
  }

  const links: ArcLink[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    links.push({
      startLat: from.latitude,
      startLng: from.longitude,
      endLat: to.latitude,
      endLng: to.longitude,
      color: [riskColor[from.risk], riskColor[to.risk]],
    });
  }
  return links;
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

const BEAM_VERTEX_SHADER = `
  varying float vY;
  void main() {
    vY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uHeight;
  uniform float uIntensity;
  uniform float uFalloff;
  varying float vY;
  void main() {
    float t = clamp((vY + uHeight * 0.5) / uHeight, 0.0, 1.0);
    float alpha = pow(1.0 - t, uFalloff) * uIntensity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export function WorldGlobe({ points }: WorldGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedPointId, setSelectedPointId] = useState(points[0]?.id ?? "");
  const [geographyState, setGeographyState] = useState<GeographyState>({ status: "loading" });

  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedPointId) ?? points[0],
    [points, selectedPointId],
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
      const { default: ThreeGlobe } = await import("three-globe");

      if (isDisposed) {
        return;
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.2, 8.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountElement.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const globeMaterial = new THREE.MeshPhongMaterial({
      color: "#070a1c",
      emissive: "#1a1450",
      emissiveIntensity: 0.32,
      shininess: 3,
      specular: "#1e1b4b",
      transparent: true,
      opacity: 0.98,
    });

    const globe = new ThreeGlobe({ animateIn: false, waitForGlobeReady: false })
      .showGlobe(true)
      .showGraticules(true)
      .showAtmosphere(true)
      .atmosphereColor("#7c3aed")
      .atmosphereAltitude(0.22)
      .globeCurvatureResolution(3)
      .globeMaterial(globeMaterial)
      .polygonsData(countryFeatures)
      .polygonCapColor(() => "#1c1147")
      .polygonSideColor(() => "rgba(124, 58, 237, 0.22)")
      .polygonStrokeColor(() => "#6366f1")
      .polygonAltitude(0.006)
      .polygonCapCurvatureResolution(2)
      .polygonsTransitionDuration(0)
      .arcsData(makeArcLinks(points))
      .arcStartLat("startLat")
      .arcStartLng("startLng")
      .arcEndLat("endLat")
      .arcEndLng("endLng")
      .arcColor("color")
      .arcAltitude(0.22)
      .arcStroke(0.42)
      .arcCurveResolution(64)
      .arcDashLength(0.42)
      .arcDashGap(0.14)
      .arcDashAnimateTime(reducedMotion ? 0 : 3200)
      .arcsTransitionDuration(0);

    globe.scale.setScalar(GLOBE_RADIUS / globe.getGlobeRadius());
    styleThinGlobeLines(globe);
    globeGroup.add(globe);

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
    const beamMaterials: THREE.ShaderMaterial[] = [];

    const beamSpec = {
      high: { length: 0.62, base: 0.024, intensity: 0.95, ringRadius: 0.05 },
      medium: { length: 0.5, base: 0.02, intensity: 0.82, ringRadius: 0.045 },
      low: { length: 0.4, base: 0.018, intensity: 0.72, ringRadius: 0.04 },
    } satisfies Record<MapPoint["risk"], { length: number; base: number; intensity: number; ringRadius: number }>;

    for (const point of points) {
      const surface = latLngToVector3(point.latitude, point.longitude, GLOBE_RADIUS);
      const color = new THREE.Color(riskColor[point.risk]);
      const spec = beamSpec[point.risk];

      const pin = new THREE.Group();
      pin.userData.pointId = point.id;
      pin.position.copy(surface);
      pin.lookAt(surface.clone().multiplyScalar(2));

      const coreBeamMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color.clone() },
          uHeight: { value: spec.length },
          uIntensity: { value: spec.intensity },
          uFalloff: { value: 1.6 },
        },
        vertexShader: BEAM_VERTEX_SHADER,
        fragmentShader: BEAM_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const coreBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002, spec.base * 0.6, spec.length, 18, 1, true),
        coreBeamMaterial,
      );
      coreBeam.rotation.x = -Math.PI / 2;
      coreBeam.position.z = -spec.length / 2;

      const haloBeamMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color.clone() },
          uHeight: { value: spec.length * 0.85 },
          uIntensity: { value: 0.32 },
          uFalloff: { value: 2.2 },
        },
        vertexShader: BEAM_VERTEX_SHADER,
        fragmentShader: BEAM_FRAGMENT_SHADER,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const haloBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, spec.base * 2.2, spec.length * 0.85, 18, 1, true),
        haloBeamMaterial,
      );
      haloBeam.rotation.x = -Math.PI / 2;
      haloBeam.position.z = -(spec.length * 0.85) / 2;

      const baseRing = new THREE.Mesh(
        new THREE.TorusGeometry(spec.ringRadius, 0.0045, 12, 48),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      baseRing.position.z = -0.003;

      const baseGlow = new THREE.Mesh(
        new THREE.CircleGeometry(spec.ringRadius * 1.6, 32),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      baseGlow.position.z = -0.001;

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.013, 18, 18),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      core.position.z = -0.006;

      pin.add(baseGlow);
      pin.add(haloBeam);
      pin.add(coreBeam);
      pin.add(baseRing);
      pin.add(core);
      pinGroup.add(pin);
      pinMeshes.push(pin);
      beamMaterials.push(coreBeamMaterial, haloBeamMaterial);
    }

    if (points[0]) {
      globeGroup.rotation.y = THREE.MathUtils.degToRad(-points[0].longitude - 90);
      globeGroup.rotation.x = THREE.MathUtils.degToRad(points[0].latitude * 0.28);
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
    const rotationVelocity = new THREE.Vector2(0.00045, 0.00088);

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
      isDragging = true;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      startRotationX = globeGroup.rotation.x;
      startRotationY = globeGroup.rotation.y;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging) {
        return;
      }

      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      globeGroup.rotation.y = startRotationY + dx * 0.006;
      globeGroup.rotation.x = THREE.MathUtils.clamp(startRotationX + dy * 0.004, -0.9, 0.9);
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

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);

    const animate = () => {
      if (!isDragging && !reducedMotion) {
        globeGroup.rotation.y += rotationVelocity.y;
        globeGroup.rotation.x += rotationVelocity.x;
        rotationVelocity.multiplyScalar(0.992);
        rotationVelocity.y = Math.max(rotationVelocity.y, 0.0005);
      }

      if (!reducedMotion) {
        stars.rotation.y += 0.00018;
        const now = performance.now();
        beamMaterials.forEach((material, index) => {
          const base = material.uniforms.uIntensity.value as number;
          const phase = Math.sin(now * 0.0019 + index * 0.7);
          material.userData.baseIntensity ??= base;
          material.uniforms.uIntensity.value =
            (material.userData.baseIntensity as number) * (0.85 + phase * 0.18);
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
      globe._destructor();
      globeMaterial.dispose();
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
  }, [geographyState, points]);

  return (
    <div className="globe-stage" aria-label="3D geographic report signals">
      <div ref={mountRef} className="globe-canvas" role="img" aria-label="Rotating globe with risk pins" />
      <div className="globe-overlay globe-overlay-top">
        <span>Supply-chain footprint</span>
        <strong>{points.length} mapped signals</strong>
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
        {points.map((point) => (
          <button
            key={point.id}
            className={point.id === selectedPoint?.id ? "legend-row legend-row-active" : "legend-row"}
            type="button"
            onClick={() => setSelectedPointId(point.id)}
          >
            <span className={`legend-dot globe-risk-${point.risk}`} />
            <span>{point.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
