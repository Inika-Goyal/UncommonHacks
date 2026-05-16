"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import type { AgentLifecycle, AgentName } from "@/agents/types";
import type { SwarmState } from "@/components/swarm-status-panel";

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // WebGL absent / blocked. Swallow — the swarm grid below is the fallback.
  }
  render() {
    if (this.state.failed) {
      return <div className="constellation-wrap constellation-placeholder constellation-fallback" aria-hidden="true" />;
    }
    return this.props.children;
  }
}

const HUB_POSITION: [number, number, number] = [0, 1.4, 0];
const SYNTHESIS_POSITION: [number, number, number] = [0, -1.6, 0];
const AGENT_RADIUS = 2.6;
const AGENT_NAMES: AgentName[] = ["news", "watchlist", "supplier", "legal", "risk_index"];

const COLORS = {
  pending: new THREE.Color("#7aa2ff"),
  running: new THREE.Color("#7aa2ff"),
  ready: new THREE.Color("#42ce8a"),
  snapshot: new THREE.Color("#42ce8a"),
  blocked: new THREE.Color("#ff7373"),
};

const HUB_COLOR = new THREE.Color("#ffa86a");
const SYNTHESIS_COLOR_IDLE = new THREE.Color("#9c8aff");
const SYNTHESIS_COLOR_ACTIVE = new THREE.Color("#ffd76a");

function agentPosition(index: number): [number, number, number] {
  const angle = (index / AGENT_NAMES.length) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * AGENT_RADIUS, 0, Math.sin(angle) * AGENT_RADIUS];
}

type ConstellationProps = {
  state: SwarmState;
  synthesisActive: boolean;
  done: boolean;
};

export function SwarmConstellation(props: ConstellationProps) {
  const [supportsWebGL, setSupportsWebGL] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const ctx =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl");
      setSupportsWebGL(Boolean(ctx));
    } catch {
      setSupportsWebGL(false);
    }
  }, []);

  if (supportsWebGL === false) {
    return <div className="constellation-wrap constellation-placeholder constellation-fallback" aria-hidden="true" />;
  }
  if (supportsWebGL === null) {
    return <div className="constellation-wrap constellation-placeholder" aria-hidden="true" />;
  }

  return (
    <WebGLBoundary>
      <div className="constellation-wrap">
        <Canvas
          camera={{ position: [0, 1.8, 6.5], fov: 45 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color(0x000000), 0);
          }}
        >
          <ambientLight intensity={0.35} />
          <pointLight position={[6, 6, 6]} intensity={1.2} color="#ffffff" />
          <pointLight position={[-6, -3, -4]} intensity={0.6} color="#5b8aff" />
          <ConstellationScene {...props} />
          <EffectComposer>
            <Bloom intensity={1.4} luminanceThreshold={0.18} luminanceSmoothing={0.18} mipmapBlur />
          </EffectComposer>
        </Canvas>
        <div className="constellation-vignette" aria-hidden="true" />
      </div>
    </WebGLBoundary>
  );
}

function ConstellationScene({ state, synthesisActive, done }: ConstellationProps) {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!group.current) return;
    // Gentle auto-orbit. Slow enough not to feel like the page is moving.
    group.current.rotation.y += delta * 0.08;
  });

  const anyRunning = AGENT_NAMES.some(
    (a) => state[a].status === "running" || state[a].status === "pending",
  );

  return (
    <group ref={group}>
      <HubNode active={anyRunning} done={done} />
      <SynthesisNode active={synthesisActive || done} />

      {AGENT_NAMES.map((name, idx) => {
        const pos = agentPosition(idx);
        const cell = state[name];
        const status = cell.status;
        return (
          <group key={name}>
            <ConnectionLine
              from={HUB_POSITION}
              to={pos}
              status={status}
              direction="outgoing"
            />
            <ConnectionLine
              from={pos}
              to={SYNTHESIS_POSITION}
              status={status}
              direction="incoming"
            />
            <AgentNode position={pos} status={status} label={name} />
            <PulseFlow
              from={HUB_POSITION}
              to={pos}
              active={status === "running" || status === "pending"}
              color={COLORS.running}
              speed={1.1}
            />
            <PulseFlow
              from={pos}
              to={SYNTHESIS_POSITION}
              active={status === "ready" || status === "snapshot"}
              color={status === "snapshot" ? COLORS.snapshot : COLORS.ready}
              speed={0.9}
            />
          </group>
        );
      })}
    </group>
  );
}

type LineStatus = AgentLifecycle;

function ConnectionLine({
  from,
  to,
  status,
  direction,
}: {
  from: [number, number, number];
  to: [number, number, number];
  status: LineStatus;
  direction: "outgoing" | "incoming";
}) {
  const baseColor = useMemo(() => {
    if (status === "blocked") return "#ff7373";
    if (status === "ready" || status === "snapshot") {
      return direction === "incoming" ? "#3dc287" : "#3a4a78";
    }
    if (status === "running" || status === "pending") {
      return direction === "outgoing" ? "#5a89ff" : "#3a4a78";
    }
    return "#3a4a78";
  }, [status, direction]);

  const opacity =
    status === "blocked"
      ? 0.7
      : status === "ready" || status === "snapshot"
        ? direction === "incoming"
          ? 0.9
          : 0.4
        : status === "running" || status === "pending"
          ? direction === "outgoing"
            ? 0.85
            : 0.35
          : 0.45;

  return (
    <Line
      points={[from, to]}
      color={baseColor}
      lineWidth={status === "ready" || status === "snapshot" ? 1.6 : 1.0}
      transparent
      opacity={opacity}
    />
  );
}

function HubNode({ active, done }: { active: boolean; done: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const phase = useRef(0);

  useFrame((_, delta) => {
    phase.current += delta;
    if (!meshRef.current) return;
    const pulse = active ? 0.05 * Math.sin(phase.current * 4.5) : 0;
    const target = done ? 1.05 : 1 + pulse;
    meshRef.current.scale.setScalar(target);
    meshRef.current.rotation.y += delta * 0.4;
    meshRef.current.rotation.x += delta * 0.18;
  });

  return (
    <group position={HUB_POSITION}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial
          color={HUB_COLOR}
          emissive={HUB_COLOR}
          emissiveIntensity={active ? 1.5 : done ? 0.9 : 0.4}
          metalness={0.45}
          roughness={0.25}
          wireframe
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial
          color={HUB_COLOR}
          emissive={HUB_COLOR}
          emissiveIntensity={active ? 1.0 : 0.5}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

function SynthesisNode({ active }: { active: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const phase = useRef(0);
  const color = active ? SYNTHESIS_COLOR_ACTIVE : SYNTHESIS_COLOR_IDLE;

  useFrame((_, delta) => {
    phase.current += delta;
    if (!meshRef.current) return;
    const pulse = active ? 0.08 * Math.sin(phase.current * 2.8) : 0;
    meshRef.current.scale.setScalar(1 + pulse);
    meshRef.current.rotation.y -= delta * 0.25;
  });

  return (
    <mesh ref={meshRef} position={SYNTHESIS_POSITION}>
      <torusKnotGeometry args={[0.42, 0.12, 96, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={active ? 1.6 : 0.6}
        metalness={0.6}
        roughness={0.2}
      />
    </mesh>
  );
}

function AgentNode({
  position,
  status,
}: {
  position: [number, number, number];
  status: AgentLifecycle;
  label: AgentName;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  const color = COLORS[status] ?? COLORS.pending;
  const intensity =
    status === "ready" || status === "snapshot"
      ? 1.4
      : status === "running"
        ? 0.9
        : status === "blocked"
          ? 1.1
          : 0.45;

  useFrame((_, delta) => {
    phase.current += delta;
    if (!meshRef.current) return;
    const breathing =
      status === "running" || status === "pending" ? 0.06 * Math.sin(phase.current * 3) : 0;
    const settle =
      status === "ready" || status === "snapshot" ? 0.04 * Math.sin(phase.current * 1.4) : 0;
    meshRef.current.scale.setScalar(1 + breathing + settle);
    meshRef.current.rotation.y += delta * 0.45;
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={intensity}
          metalness={0.4}
          roughness={0.25}
        />
      </mesh>
      {/* Outer ring that brightens when ready */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.014, 16, 64]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={status === "ready" || status === "snapshot" ? 1.5 : 0.3}
          transparent
          opacity={status === "blocked" ? 0.45 : 0.85}
        />
      </mesh>
    </group>
  );
}

type Pulse = {
  id: number;
  t: number;
};

function PulseFlow({
  from,
  to,
  active,
  color,
  speed,
}: {
  from: [number, number, number];
  to: [number, number, number];
  active: boolean;
  color: THREE.Color;
  speed: number;
}) {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const nextId = useRef(0);
  const spawn = useRef(0);

  // Spawn a new pulse every ~1s while active.
  useFrame((_, delta) => {
    if (!active) {
      setPulses((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    spawn.current += delta;
    if (spawn.current >= 0.9) {
      spawn.current = 0;
      setPulses((prev) => [...prev, { id: nextId.current++, t: 0 }]);
    }
    setPulses((prev) =>
      prev
        .map((p) => ({ ...p, t: p.t + delta * speed }))
        .filter((p) => p.t <= 1.05),
    );
  });

  const fromVec = useMemo(() => new THREE.Vector3(...from), [from]);
  const toVec = useMemo(() => new THREE.Vector3(...to), [to]);

  return (
    <group>
      {pulses.map((p) => {
        const pos = fromVec.clone().lerp(toVec, Math.min(1, p.t));
        const opacity = 1 - Math.max(0, p.t - 0.85) / 0.2;
        return (
          <mesh key={p.id} position={[pos.x, pos.y, pos.z]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={2.4}
              transparent
              opacity={Math.max(0, opacity)}
            />
          </mesh>
        );
      })}
    </group>
  );
}

type SwarmConstellationWrapperProps = {
  state: SwarmState;
  synthesisActive: boolean;
  done: boolean;
};

// Renderer wrapper: gates on client-side mount to avoid Next 16 SSR hydration noise.
export function SwarmConstellationClient(props: SwarmConstellationWrapperProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="constellation-wrap constellation-placeholder" aria-hidden="true" />;
  }
  return <SwarmConstellation {...props} />;
}
