'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import VideoBackground from '@/components/VideoBackground';
import { APP_NAME } from '@/lib/config';

const EXPLOIT_TYPES = ['Forced Labor', 'Sexual Exploitation', 'Child Labor', 'Illegal Profits'];

const REGIONAL_DATA = [
  {
    region: 'East Asia',
    riskScore: 4.5,
    forced: 4.8,
    sexual: 2.1,
    child: 3.2,
    profits: 4.0,
    color: '#ef4444',
  },
  {
    region: 'South & SE Asia',
    riskScore: 4.2,
    forced: 4.5,
    sexual: 3.1,
    child: 4.0,
    profits: 3.5,
    color: '#f97316',
  },
  {
    region: 'Sub-Saharan Africa',
    riskScore: 3.8,
    forced: 3.5,
    sexual: 3.2,
    child: 4.5,
    profits: 2.8,
    color: '#f59e0b',
  },
  {
    region: 'Middle East & NA',
    riskScore: 3.2,
    forced: 3.0,
    sexual: 3.5,
    child: 2.8,
    profits: 3.2,
    color: '#eab308',
  },
  {
    region: 'Latin America',
    riskScore: 2.9,
    forced: 2.5,
    sexual: 3.2,
    child: 3.0,
    profits: 2.8,
    color: '#84cc16',
  },
  {
    region: 'Eastern Europe',
    riskScore: 2.5,
    forced: 2.0,
    sexual: 3.5,
    child: 1.8,
    profits: 2.2,
    color: '#22c55e',
  },
];

// Scatter data: GDP per capita ($k) vs composite risk score
const SCATTER_DATA = [
  { x: 0.4, y: 4.8, label: 'Myanmar' },
  { x: 0.5, y: 4.5, label: 'Xinjiang' },
  { x: 1.2, y: 4.1, label: 'Bangladesh' },
  { x: 1.8, y: 3.6, label: 'Cambodia' },
  { x: 2.2, y: 3.8, label: 'Nigeria' },
  { x: 3.4, y: 3.2, label: 'India' },
  { x: 5.2, y: 2.5, label: 'Vietnam' },
  { x: 8.1, y: 2.1, label: 'Brazil' },
  { x: 10.4, y: 1.9, label: 'Colombia' },
  { x: 12.4, y: 1.4, label: 'Mexico' },
  { x: 15.1, y: 1.6, label: 'Romania' },
  { x: 18.2, y: 1.1, label: 'Moldova' },
];

type ExploitKey = 'forced' | 'sexual' | 'child' | 'profits';

const EXPLOIT_KEYS: Record<string, ExploitKey> = {
  'Forced Labor': 'forced',
  'Sexual Exploitation': 'sexual',
  'Child Labor': 'child',
  'Illegal Profits': 'profits',
};

// Lightweight SVG bar chart — no external library
function SvgBarChart({
  data,
  activeExploit,
}: {
  data: typeof REGIONAL_DATA;
  activeExploit: string;
}) {
  const key = EXPLOIT_KEYS[activeExploit] ?? 'forced';
  const W = 560;
  const H = 260;
  const padL = 32;
  const padB = 48;
  const chartW = W - padL - 16;
  const chartH = H - padB - 16;
  const maxVal = 5;
  const barW = chartW / data.length - 12;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Y gridlines */}
      {[1, 2, 3, 4, 5].map((v) => {
        const y = 16 + chartH - (v / maxVal) * chartH;
        return (
          <g key={v}>
            <line
              x1={padL}
              y1={y}
              x2={W - 16}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
            <text x={padL - 6} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={9}>
              {v}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const val = d[key] as number;
        const barH = (val / maxVal) * chartH;
        const x = padL + i * (chartW / data.length) + 6;
        const y = 16 + chartH - barH;
        return (
          <g key={d.region}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={d.color}
              opacity={0.75}
              rx={4}
            />
            <text
              x={x + barW / 2}
              y={H - padB + 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize={8}
            >
              {d.region.split(' ')[0]}
            </text>
            <text
              x={x + barW / 2}
              y={H - padB + 24}
              textAnchor="middle"
              fill="rgba(255,255,255,0.25)"
              fontSize={7}
            >
              {d.region.split(' ').slice(1).join(' ')}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line
        x1={padL}
        y1={16}
        x2={padL}
        y2={16 + chartH}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
      <line
        x1={padL}
        y1={16 + chartH}
        x2={W - 16}
        y2={16 + chartH}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
    </svg>
  );
}

// Lightweight SVG scatter plot
function SvgScatterPlot() {
  const W = 520;
  const H = 260;
  const padL = 40;
  const padB = 40;
  const chartW = W - padL - 16;
  const chartH = H - padB - 16;
  const maxX = 20;
  const maxY = 5.5;

  function toXY(x: number, y: number) {
    return [
      padL + (x / maxX) * chartW,
      16 + chartH - (y / maxY) * chartH,
    ];
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Gridlines */}
      {[1, 2, 3, 4, 5].map((v) => {
        const y = 16 + chartH - (v / maxY) * chartH;
        return (
          <line
            key={v}
            x1={padL}
            y1={y}
            x2={W - 16}
            y2={y}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
        );
      })}
      {[5, 10, 15, 20].map((v) => {
        const x = padL + (v / maxX) * chartW;
        return (
          <line
            key={v}
            x1={x}
            y1={16}
            x2={x}
            y2={16 + chartH}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
        );
      })}

      {/* Trend line (approximate) */}
      <line
        x1={toXY(0, 5)[0]}
        y1={toXY(0, 5)[1]}
        x2={toXY(20, 0.8)[0]}
        y2={toXY(20, 0.8)[1]}
        stroke="rgba(239,68,68,0.2)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />

      {/* Points */}
      {SCATTER_DATA.map((d) => {
        const [px, py] = toXY(d.x, d.y);
        return (
          <g key={d.label}>
            <circle cx={px} cy={py} r={6} fill="rgba(239,68,68,0.2)" />
            <circle cx={px} cy={py} r={3.5} fill="#ef4444" opacity={0.85} />
            <text
              x={px + 7}
              y={py + 4}
              fill="rgba(255,255,255,0.45)"
              fontSize={8}
            >
              {d.label}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      {[5, 10, 15, 20].map((v) => (
        <text
          key={v}
          x={padL + (v / maxX) * chartW}
          y={H - padB + 14}
          textAnchor="middle"
          fill="rgba(255,255,255,0.3)"
          fontSize={9}
        >
          ${v}k
        </text>
      ))}
      {[1, 2, 3, 4, 5].map((v) => (
        <text
          key={v}
          x={padL - 6}
          y={16 + chartH - (v / maxY) * chartH + 4}
          textAnchor="end"
          fill="rgba(255,255,255,0.3)"
          fontSize={9}
        >
          {v}
        </text>
      ))}

      {/* Axes */}
      <line
        x1={padL}
        y1={16}
        x2={padL}
        y2={16 + chartH}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
      <line
        x1={padL}
        y1={16 + chartH}
        x2={W - 16}
        y2={16 + chartH}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
      />
      <text
        x={padL + chartW / 2}
        y={H - 4}
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize={9}
      >
        GDP per capita (USD thousands)
      </text>
      <text
        x={10}
        y={16 + chartH / 2}
        textAnchor="middle"
        fill="rgba(255,255,255,0.25)"
        fontSize={9}
        transform={`rotate(-90, 10, ${16 + chartH / 2})`}
      >
        Risk Score
      </text>
    </svg>
  );
}

// Geographic risk grid — regional heat map
function RegionalRiskGrid({
  data,
  activeExploits,
}: {
  data: typeof REGIONAL_DATA;
  activeExploits: string[];
}) {
  const sorted = [...data].sort((a, b) => b.riskScore - a.riskScore);

  function exploitScore(d: (typeof REGIONAL_DATA)[0]) {
    if (activeExploits.length === 0) return d.riskScore;
    const keys = activeExploits.map((e) => EXPLOIT_KEYS[e]).filter(Boolean);
    if (keys.length === 0) return d.riskScore;
    return keys.reduce((sum, k) => sum + (d[k as ExploitKey] as number), 0) / keys.length;
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {sorted.map((d) => {
        const score = exploitScore(d);
        const pct = (score / 5) * 100;
        return (
          <div key={d.region} className="flex items-center gap-4 p-3 rounded-xl bg-white/5">
            <div className="w-32 shrink-0">
              <p className="text-white/80 text-xs font-medium">{d.region}</p>
            </div>
            <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: d.color }}
              />
            </div>
            <span
              className="text-xs font-medium w-12 text-right shrink-0"
              style={{ color: d.color }}
            >
              {score.toFixed(1)} / 5
            </span>
            <div className="flex gap-1 shrink-0">
              {EXPLOIT_TYPES.map((type) => {
                const k = EXPLOIT_KEYS[type];
                const v = d[k] as number;
                return (
                  <div
                    key={type}
                    title={`${type}: ${v}`}
                    className="w-4 h-4 rounded-sm"
                    style={{ background: d.color, opacity: v / 5 }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex justify-end gap-2 mt-1">
        {EXPLOIT_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-white/30" />
            <span className="text-white/30 text-[10px]">{type.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'geographic' | 'analytical'>('geographic');
  const [activeExploits, setActiveExploits] = useState<string[]>(['Forced Labor']);
  const [activeBarExploit, setActiveBarExploit] = useState('Forced Labor');

  function toggleExploit(type: string) {
    setActiveExploits((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  return (
    <div className="relative min-h-screen">
      <VideoBackground />

      <div className="relative z-10 flex flex-col min-h-screen p-4 gap-4">
        {/* Nav */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="liquid-glass flex items-center gap-2 px-3 py-2 rounded-xl text-white/60 hover:text-white text-sm transition-colors">
              <ArrowLeft size={14} /> Home
            </button>
          </Link>
          <div className="flex-1" />
          <div className="liquid-glass px-4 py-2 rounded-xl text-sm text-white/50">
            <span className="text-white font-medium">{APP_NAME}</span>
            <span className="mx-2 text-white/20">·</span>
            Analytics
          </div>
          <div className="liquid-glass rounded-xl p-1 flex gap-1">
            {(['geographic', 'analytical'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-1.5 rounded-lg text-xs transition-all duration-200 capitalize"
                style={{
                  background: activeTab === tab ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: activeTab === tab ? 'white' : 'rgba(255,255,255,0.35)',
                }}
              >
                {tab === 'geographic' ? 'Geographic' : 'Analytical'}
              </button>
            ))}
          </div>
        </div>

        {/* Geographic tab */}
        {activeTab === 'geographic' && (
          <motion.div
            key="geo"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="liquid-glass rounded-2xl p-6 flex-1 flex flex-col gap-5"
          >
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-white text-base font-medium">Global Risk Map</h2>
                <p className="text-white/35 text-xs mt-0.5">
                  Exploitation intensity by region — heat cells show relative score per exploit type
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {EXPLOIT_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleExploit(type)}
                    className="liquid-glass text-xs px-3 py-1.5 rounded-full border transition-all"
                    style={{
                      borderColor: activeExploits.includes(type)
                        ? 'rgba(255,255,255,0.3)'
                        : 'rgba(255,255,255,0.08)',
                      color: activeExploits.includes(type)
                        ? 'white'
                        : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <RegionalRiskGrid data={REGIONAL_DATA} activeExploits={activeExploits} />
          </motion.div>
        )}

        {/* Analytical tab */}
        {activeTab === 'analytical' && (
          <motion.div
            key="analytical"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-2 gap-4 flex-1"
          >
            {/* Bar chart */}
            <div className="liquid-glass rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-white text-sm font-medium">Exploitation by Region</h2>
                  <p className="text-white/35 text-xs mt-0.5">Risk score 1–5 per exploit type</p>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {EXPLOIT_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setActiveBarExploit(type)}
                      className="liquid-glass text-[10px] px-2 py-1 rounded-full border transition-all"
                      style={{
                        borderColor:
                          activeBarExploit === type
                            ? 'rgba(255,255,255,0.3)'
                            : 'rgba(255,255,255,0.06)',
                        color:
                          activeBarExploit === type ? 'white' : 'rgba(255,255,255,0.25)',
                      }}
                    >
                      {type.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <SvgBarChart data={REGIONAL_DATA} activeExploit={activeBarExploit} />
              </div>
            </div>

            {/* Scatter plot */}
            <div className="liquid-glass rounded-2xl p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-white text-sm font-medium">
                  Economic Indicator vs Risk Score
                </h2>
                <p className="text-white/35 text-xs mt-0.5">
                  GDP per capita (USD thousands) against composite exploitation score
                </p>
              </div>
              <div className="flex-1">
                <SvgScatterPlot />
              </div>
              <p className="text-white/20 text-[10px]">
                Dashed line = approximate trend. Inverse correlation: lower GDP → higher exploitation risk.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
