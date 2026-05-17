'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ChevronDown,
  Loader2,
  Newspaper,
  ShieldAlert,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import VideoBackground from '@/components/VideoBackground';
import { APP_NAME } from '@/lib/config';
import { getRiskColor } from '@/lib/demoData';

type InputMode = 'company' | 'region';

const REGIONS = [
  'South & Southeast Asia',
  'East Asia',
  'Sub-Saharan Africa',
  'Latin America',
  'Eastern Europe',
  'Middle East & North Africa',
];

const EXPLOIT_PILLS = ['Forced Labor', 'Sexual Exploitation', 'Child Labor', 'Illegal Profits'];

const HOME_AGENTS = [
  { id: 'news', label: 'News Agent' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'legal', label: 'Legal' },
  { id: 'risk', label: 'Risk Index' },
];

const LIVE_FEED = [
  { location: 'Xinjiang, China', type: 'Forced Labor', risk: 5 },
  { location: 'Dhaka, Bangladesh', type: 'Labor Violations', risk: 3 },
  { location: 'Yangon, Myanmar', type: 'Military Links', risk: 4 },
];

// Orthographic mini-globe centred on 20°N 85°E
function MiniGlobe() {
  const R = 36;
  const cx = 48;
  const cy = 40;
  const φ0 = (20 * Math.PI) / 180;
  const λ0 = (85 * Math.PI) / 180;

  function project(lat: number, lng: number): [number, number] {
    const φ = (lat * Math.PI) / 180;
    const λ = (lng * Math.PI) / 180;
    const x = R * Math.cos(φ) * Math.sin(λ - λ0);
    const y =
      -R *
      (Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0) -
        Math.cos(φ0) * Math.sin(φ));
    return [cx + x, cy + y];
  }

  const pins = [
    { lat: 41.2, lng: 85.5, color: '#ef4444' },
    { lat: 23.8, lng: 90.4, color: '#f59e0b' },
    { lat: 16.9, lng: 96.2, color: '#f97316' },
  ];

  const latLines = [-60, -30, 0, 30, 60];
  const lngLines = [30, 60, 90, 120, 150];

  return (
    <svg width="96" height="80" viewBox="0 0 96 80">
      <defs>
        <radialGradient id="sg" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#1a2340" />
          <stop offset="100%" stopColor="#060a18" />
        </radialGradient>
        <clipPath id="sc">
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="url(#sg)" />
      <g clipPath="url(#sc)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" fill="none">
        {latLines.map((lat) => {
          const pts = Array.from({ length: 37 }, (_, i) => {
            const [x, y] = project(lat, -180 + i * 10);
            return `${x},${y}`;
          });
          return <polyline key={lat} points={pts.join(' ')} />;
        })}
        {lngLines.map((lng) => {
          const pts = Array.from({ length: 19 }, (_, i) => {
            const [x, y] = project(-90 + i * 10, lng);
            return `${x},${y}`;
          });
          return <polyline key={lng} points={pts.join(' ')} />;
        })}
      </g>
      {pins.map(({ lat, lng, color }, i) => {
        const [x, y] = project(lat, lng);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={5} fill={color} opacity={0.22} />
            <circle cx={x} cy={y} r={2.5} fill={color} />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
    </svg>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>('company');
  const [company, setCompany] = useState('');
  const [region, setRegion] = useState('');
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    if (mode === 'company' && !company.trim()) return;
    if (mode === 'region' && !region) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1800));
    router.push('/results');
  };

  const isValid = mode === 'company' ? company.trim().length > 0 : region.length > 0;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <VideoBackground />

      <div className="relative z-10 flex min-h-screen gap-6">

        {/* ── LEFT PANEL ── */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="w-[52%] shrink-0 relative min-h-screen"
        >
          {/* glass overlay sits inside the margin */}
          <div className="liquid-glass-strong m-6 rounded-3xl flex flex-col">

            {/* Nav */}
            <div className="flex items-center justify-between px-7 pt-7">
              <div className="flex items-center gap-2.5">
                <ExposeLogo />
                <span className="text-white text-base tracking-[0.18em] font-light uppercase">
                  {APP_NAME}
                </span>
              </div>
              <button className="liquid-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white/50 text-xs hover:text-white transition-colors">
                ☰ Menu
              </button>
            </div>

            {/* Centre block — badge + hero + search + pills, vertically centred */}
            <div className="flex-1 flex flex-col justify-center gap-7 px-7 py-8">
              {/* Badge */}
              <div className="flex justify-center">
                <div className="liquid-glass w-14 h-14 rounded-full flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-white/15 ring-1 ring-white/20" />
                </div>
              </div>

              {/* Hero */}
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.8 }}
                className="text-white text-6xl font-semibold leading-[1.08] tracking-[-0.03em]"
              >
                Surface exploitation.{' '}
                <span
                  className="font-light opacity-70 italic"
                  style={{ fontFamily: 'var(--font-source-serif), Georgia, serif' }}
                >
                  Before it surfaces you.
                </span>
              </motion.h1>

              {/* Search */}
              <div className="liquid-glass rounded-2xl p-4">
                <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-3">
                  {(['company', 'region'] as InputMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className="flex-1 py-1.5 rounded-lg text-xs transition-all duration-200"
                      style={{
                        background: mode === m ? 'rgba(255,255,255,0.12)' : 'transparent',
                        color: mode === m ? 'white' : 'rgba(255,255,255,0.35)',
                      }}
                    >
                      {m === 'company' ? 'Company' : 'Region'}
                    </button>
                  ))}
                </div>

                {mode === 'company' ? (
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Enter a company name..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm outline-none focus:border-white/25 transition-colors mb-3"
                  />
                ) : (
                  <div className="relative mb-3">
                    <button
                      onClick={() => setShowRegionMenu((v) => !v)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm flex items-center justify-between hover:border-white/20 transition-colors"
                      style={{ color: region ? 'white' : 'rgba(255,255,255,0.25)' }}
                    >
                      <span>{region || 'Enter a region...'}</span>
                      <ChevronDown
                        size={13}
                        className="text-white/30 transition-transform duration-200"
                        style={{ transform: showRegionMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </button>
                    {showRegionMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="liquid-glass absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden z-20"
                      >
                        {REGIONS.map((r) => (
                          <button
                            key={r}
                            onClick={() => { setRegion(r); setShowRegionMenu(false); }}
                            className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            {r}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                )}

                <motion.button
                  onClick={handleSubmit}
                  disabled={!isValid || loading}
                  whileHover={isValid && !loading ? { scale: 1.015 } : {}}
                  whileTap={isValid && !loading ? { scale: 0.985 } : {}}
                  className="liquid-glass-strong w-full py-3 rounded-xl text-xs font-medium tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-2"
                  style={{
                    color: isValid && !loading ? 'white' : 'rgba(255,255,255,0.25)',
                    cursor: isValid && !loading ? 'pointer' : 'not-allowed',
                  }}
                >
                  {loading ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                        <Loader2 size={13} />
                      </motion.div>
                      Launching agents…
                    </>
                  ) : 'INVESTIGATE'}
                </motion.button>
              </div>

              {/* Pills */}
              <div className="flex flex-wrap gap-2">
                {EXPLOIT_PILLS.map((pill) => (
                  <span key={pill} className="liquid-glass text-white/50 text-xs px-3 py-1.5 rounded-full">
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            {/* Stat — pinned at bottom */}
            <div className="px-7 pb-7 pt-5 border-t border-white/10 text-center">
              <p className="text-white/35 text-[10px] tracking-[0.22em] uppercase mb-2">
                The Scale of the Problem
              </p>
              <p className="text-white/90 text-lg font-light">40.3 million people</p>
              <p className="text-white/45 text-xs mt-0.5">live in modern slavery today.</p>
              <div className="flex items-center gap-2 mt-2.5 justify-center">
                <div className="flex-1 h-px bg-white/10" />
                <p className="text-white/25 text-[10px] whitespace-nowrap">
                  — Walk Free Global Slavery Index
                </p>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── RIGHT PANEL ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="w-[48%] flex flex-col p-6 min-h-screen"
        >
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="liquid-glass rounded-2xl px-4 py-2.5 flex items-center gap-4 flex-1 overflow-hidden">
              <span className="text-white/25 text-[10px] tracking-[0.18em] uppercase shrink-0">
                Agent Swarm — Ready
              </span>
              {HOME_AGENTS.map((agent) => (
                <div key={agent.id} className="flex items-center gap-1.5 min-w-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-white/55 text-xs truncate max-w-[7rem]">{agent.label}</span>
                </div>
              ))}
            </div>
            <button className="liquid-glass flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white/50 text-xs hover:text-white transition-colors shrink-0">
              ✦ Account
            </button>
          </div>

          {/* Recently Flagged — small card like Bloom's "Enter our ecosystem" */}
          <div className="liquid-glass rounded-2xl p-4 w-56">
            <p className="text-white text-sm font-medium mb-0.5">Recently Flagged</p>
            <p className="text-white/40 text-xs mb-3">Live risk intelligence feed</p>
            <div className="flex flex-col gap-2">
              {LIVE_FEED.map((entry) => (
                <div key={entry.location} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getRiskColor(entry.risk) }} />
                  <span className="text-white/70 text-xs flex-1 leading-tight">{entry.location}</span>
                  <span className="text-[10px] font-medium shrink-0" style={{ color: getRiskColor(entry.risk) }}>
                    {entry.risk}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Spacer — planet shows through here */}
          <div className="flex-1" />

          {/* Bottom outer container — matches Bloom's bottom section */}
          <div className="liquid-glass rounded-[2rem] p-3 mb-3">
            {/* Two tall agent cards side by side */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="liquid-glass rounded-3xl p-5">
                <div className="liquid-glass w-9 h-9 rounded-xl flex items-center justify-center mb-3">
                  <Newspaper size={16} className="text-white/50" />
                </div>
                <p className="text-white text-sm font-medium">News Agent</p>
                <p className="text-white/40 text-xs mt-0.5">Neural render pipeline</p>
              </div>
              <div className="liquid-glass rounded-3xl p-5">
                <div className="liquid-glass w-9 h-9 rounded-xl flex items-center justify-center mb-3">
                  <ShieldAlert size={16} className="text-white/50" />
                </div>
                <p className="text-white text-sm font-medium">Watchlist Agent</p>
                <p className="text-white/40 text-xs mt-0.5">Species + cultivar library</p>
              </div>
            </div>

            {/* Globe card — wide bottom card */}
            <Link href="/results" className="block">
              <div className="liquid-glass rounded-2xl p-3 flex items-center gap-4 hover:bg-white/5 transition-colors cursor-pointer">
                <div className="shrink-0">
                  <MiniGlobe />
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">Supply Chain Globe</p>
                  <p className="text-white/40 text-xs mt-0.5">Interactive 3D risk mapping</p>
                </div>
                <div className="liquid-glass w-8 h-8 rounded-full flex items-center justify-center text-white/50 shrink-0">
                  <ChevronRight size={14} />
                </div>
              </div>
            </Link>
          </div>

          {/* Analytics — slim link below container */}
          <Link href="/analytics">
            <div className="liquid-glass rounded-2xl p-3 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer">
              <div className="liquid-glass w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
                <BarChart3 size={13} className="text-white/50" />
              </div>
              <div className="flex-1">
                <p className="text-white text-xs font-medium">Analytics Dashboard</p>
                <p className="text-white/35 text-[10px]">Regional trends & risk analysis</p>
              </div>
              <ChevronRight size={12} className="text-white/30" />
            </div>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

function ExposeLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
      <circle
        cx="12"
        cy="12"
        r="3.5"
        fill="rgba(255,255,255,0.1)"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1"
      />
      <line x1="12" y1="2" x2="12" y2="7" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <line x1="12" y1="17" x2="12" y2="22" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <line x1="2" y1="12" x2="7" y2="12" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <line x1="17" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
    </svg>
  );
}
