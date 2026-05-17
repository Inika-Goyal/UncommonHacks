'use client';

import { motion } from 'motion/react';
import { Music2, Share2, MessageCircle, Play, Camera } from 'lucide-react';
import { APP_NAME } from '@/lib/config';

const LINKS = {
  Discover: ['Overview', 'How It Works', 'Supply Chain Map', 'Risk Index'],
  'The Mission': ['About Lumina', 'Research Partners', 'Impact Reports', 'Press'],
  Concierge: ['Request Analysis', 'Enterprise API', 'Legal Referrals', 'Contact'],
};

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
      className="liquid-glass relative z-10 mt-auto"
      style={{ borderRadius: '1.5rem 1.5rem 0 0' }}
    >
      <div className="max-w-7xl mx-auto px-8 pt-10 pb-6">
        {/* Logo + tagline */}
        <div className="flex items-center gap-3 mb-8">
          <LuminaLogo />
          <span className="text-white text-2xl font-light tracking-[0.3em] uppercase">
            {APP_NAME}
          </span>
        </div>

        {/* 3-column links */}
        <div className="grid grid-cols-3 gap-8 mb-10">
          {Object.entries(LINKS).map(([heading, items]) => (
            <div key={heading}>
              <p className="text-white/50 text-xs tracking-widest uppercase mb-3">
                {heading}
              </p>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-white/70 text-sm hover:text-white transition-colors duration-200"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-5 flex items-center justify-between">
          <p className="text-white/30 text-xs">
            © 2026 {APP_NAME}. Advancing labour rights through technology.
          </p>
          <div className="flex items-center gap-4">
            {[Music2, Share2, MessageCircle, Play, Camera].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="text-white/40 hover:text-white transition-colors duration-200"
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </motion.footer>
  );
}

function LuminaLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 16 + 7 * Math.cos(rad);
        const y1 = 16 + 7 * Math.sin(rad);
        const x2 = 16 + 13 * Math.cos(rad);
        const y2 = 16 + 13 * Math.sin(rad);
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1"
          />
        );
      })}
      <circle cx="16" cy="16" r="2" fill="white" />
    </svg>
  );
}
