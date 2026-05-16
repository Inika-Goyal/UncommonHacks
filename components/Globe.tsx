'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { SupplierPin } from '@/lib/demoData';
import { getRiskColor } from '@/lib/demoData';

interface Props {
  suppliers: SupplierPin[];
  hqLat: number;
  hqLng: number;
}

interface Tooltip {
  x: number;
  y: number;
  supplier: SupplierPin;
}

const GLOBE_RADIUS = 1.6;
const ARC_SEGMENTS = 60;

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function buildArcPoints(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  radius: number,
  segments: number
): THREE.Vector3[] {
  const start = latLngToVec3(fromLat, fromLng, radius);
  const end = latLngToVec3(toLat, toLng, radius);
  const points: THREE.Vector3[] = [];
  const angle = start.angleTo(end);
  const arcHeight = radius * 0.5 + angle * 0.6;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const interp = new THREE.Vector3().lerpVectors(start, end, t);
    interp.normalize().multiplyScalar(radius + arcHeight * Math.sin(Math.PI * t));
    points.push(interp);
  }
  return points;
}

export default function Globe({ suppliers, hqLat, hqLng }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const isHovering = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Globe sphere
    const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x0a0f1e,
      transparent: true,
      opacity: 0.95,
      shininess: 30,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // Grid lines (latitude/longitude)
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1a3a6e, transparent: true, opacity: 0.4 });

    // Latitude rings
    for (let lat = -75; lat <= 75; lat += 15) {
      const ring: THREE.Vector3[] = [];
      for (let lng = 0; lng <= 360; lng += 3) {
        ring.push(latLngToVec3(lat, lng - 180, GLOBE_RADIUS + 0.002));
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(ring);
      scene.add(new THREE.Line(ringGeo, gridMat));
    }

    // Longitude lines
    for (let lng = 0; lng < 360; lng += 15) {
      const meridian: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) {
        meridian.push(latLngToVec3(lat, lng - 180, GLOBE_RADIUS + 0.002));
      }
      const meridianGeo = new THREE.BufferGeometry().setFromPoints(meridian);
      scene.add(new THREE.Line(meridianGeo, gridMat));
    }

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 64, 64);
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x1a4080,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0x6688ff, 1.2);
    dirLight.position.set(3, 3, 3);
    scene.add(dirLight);

    // HQ pin (white)
    const hqVec = latLngToVec3(hqLat, hqLng, GLOBE_RADIUS);
    const hqGeo = new THREE.SphereGeometry(0.035, 12, 12);
    const hqMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hqMesh = new THREE.Mesh(hqGeo, hqMat);
    hqMesh.position.copy(hqVec);
    scene.add(hqMesh);

    // Supplier pins + arcs
    const pinMeshes: Array<{ mesh: THREE.Mesh; supplier: SupplierPin }> = [];

    suppliers.forEach((supplier) => {
      // Pin
      const pinVec = latLngToVec3(supplier.lat, supplier.lng, GLOBE_RADIUS);
      const pinSize = 0.025 + supplier.riskScore * 0.012;
      const pinGeo = new THREE.SphereGeometry(pinSize, 12, 12);
      const pinMat = new THREE.MeshBasicMaterial({ color: getRiskColor(supplier.riskScore) });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.copy(pinVec);
      scene.add(pinMesh);
      pinMeshes.push({ mesh: pinMesh, supplier });

      // Outer ring on high-risk pins
      if (supplier.riskScore >= 4) {
        const ringGeo = new THREE.RingGeometry(pinSize * 1.5, pinSize * 2, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: getRiskColor(supplier.riskScore),
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pinVec);
        ring.lookAt(pinVec.clone().multiplyScalar(2));
        scene.add(ring);
      }

      // Arc from HQ to supplier
      const arcPoints = buildArcPoints(hqLat, hqLng, supplier.lat, supplier.lng, GLOBE_RADIUS, ARC_SEGMENTS);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.25,
      });
      scene.add(new THREE.Line(arcGeo, arcMat));
    });

    // Rotation
    const rotationGroup = new THREE.Group();
    scene.add(rotationGroup);
    globe.parent?.remove(globe);
    rotationGroup.add(globe);

    // Raycaster for hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = pinMeshes.map((p) => p.mesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const found = pinMeshes.find((p) => p.mesh === hit);
        if (found) {
          setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, supplier: found.supplier });
          isHovering.current = true;
        }
      } else {
        setTooltip(null);
        isHovering.current = false;
      }
    };

    mount.addEventListener('mousemove', onMouseMove);

    // Animation
    let animId: number;
    let rotation = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isHovering.current) {
        rotation += 0.002;
      }
      globe.rotation.y = rotation;
      // Keep pins/arcs in sync with globe rotation
      pinMeshes.forEach(({ mesh, supplier }) => {
        const vec = latLngToVec3(supplier.lat, supplier.lng + (rotation * 180) / Math.PI, GLOBE_RADIUS);
        mesh.position.copy(vec);
      });
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      mount.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [suppliers, hqLat, hqLng]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      {tooltip && (
        <div
          className="liquid-glass absolute pointer-events-none rounded-xl px-3 py-2 text-sm z-20"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="text-white font-medium text-sm">{tooltip.supplier.name}</p>
          <p className="text-white/60 text-xs">{tooltip.supplier.country}</p>
          <p className="text-xs mt-1" style={{ color: getRiskColor(tooltip.supplier.riskScore) }}>
            Risk: {tooltip.supplier.riskScore}/5
          </p>
        </div>
      )}
    </div>
  );
}
