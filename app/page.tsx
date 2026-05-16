'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import VideoBackground from '@/components/VideoBackground';
import Footer from '@/components/Footer';

type InputMode = 'company' | 'region';

const REGIONS = [
  'South & Southeast Asia',
  'East Asia',
  'Sub-Saharan Africa',
  'Latin America',
  'Eastern Europe',
  'Middle East & North Africa',
];

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
    <div className="relative min-h-screen flex flex-col">
      <VideoBackground />

      <main className="relative z-10 flex-1 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="w-full max-w-lg"
        >
          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-center mb-8"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <LuminaLogo />
              <span className="text-white text-3xl tracking-[0.35em] uppercase font-light">
                LUMINA
              </span>
            </div>
            <p className="text-white/50 text-sm tracking-wide">
              Labour Exploitation Intelligence Platform
            </p>
          </motion.div>

          {/* Glass card */}
          <div className="liquid-glass rounded-3xl p-7">
            {/* Mode toggle */}
            <div className="flex gap-1 bg-white/5 rounded-2xl p-1 mb-6">
              {(['company', 'region'] as InputMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-2 rounded-xl text-sm transition-all duration-200"
                  style={{
                    background: mode === m ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: mode === m ? 'white' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {m === 'company' ? 'Company' : 'Region'}
                </button>
              ))}
            </div>

            {/* Input */}
            {mode === 'company' ? (
              <div className="relative mb-4">
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter company name (e.g. Shein, Nike, H&M)"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/30 text-sm outline-none focus:border-white/25 transition-colors pr-10"
                />
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25" size={16} />
              </div>
            ) : (
              <div className="relative mb-4">
                <button
                  onClick={() => setShowRegionMenu((v) => !v)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-sm flex items-center justify-between transition-colors hover:border-white/20"
                  style={{ color: region ? 'white' : 'rgba(255,255,255,0.3)' }}
                >
                  <span>{region || 'Select a geographic region'}</span>
                  <ChevronDown
                    size={14}
                    className="text-white/30 transition-transform duration-200"
                    style={{ transform: showRegionMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
                {showRegionMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="liquid-glass absolute top-full mt-1 left-0 right-0 rounded-2xl overflow-hidden z-20"
                  >
                    {REGIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => { setRegion(r); setShowRegionMenu(false); }}
                        className="w-full text-left px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        {r}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            )}

            {/* Submit button */}
            <motion.button
              onClick={handleSubmit}
              disabled={!isValid || loading}
              whileHover={isValid && !loading ? { scale: 1.02 } : {}}
              whileTap={isValid && !loading ? { scale: 0.98 } : {}}
              className="liquid-glass w-full py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2"
              style={{
                color: isValid && !loading ? 'white' : 'rgba(255,255,255,0.3)',
                cursor: isValid && !loading ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    <Loader2 size={15} />
                  </motion.div>
                  Launching Agent Swarm…
                </>
              ) : (
                <>
                  <Search size={15} />
                  Analyse {mode === 'company' ? 'Company' : 'Region'}
                </>
              )}
            </motion.button>

            <p className="text-white/20 text-xs text-center mt-4">
              Analysis uses public data sources only. Not legal advice.
            </p>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}

function LuminaLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 16 + 7 * Math.cos(rad);
        const y1 = 16 + 7 * Math.sin(rad);
        const x2 = 16 + 13 * Math.cos(rad);
        const y2 = 16 + 13 * Math.sin(rad);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />;
      })}
      <circle cx="16" cy="16" r="2" fill="white" />
    </svg>
  );
}
