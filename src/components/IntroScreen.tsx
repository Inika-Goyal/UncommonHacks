'use client';

import { useEffect, useState } from 'react';

interface IntroScreenProps {
  onComplete: () => void;
}

export default function IntroScreen({ onComplete }: IntroScreenProps) {
  const [fading, setFading] = useState(false);
  const [showTagline, setShowTagline] = useState(false);
  const [showReady, setShowReady] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowTagline(true), 1800);
    const t2 = setTimeout(() => setShowReady(true), 2800);
    const t3 = setTimeout(() => setFading(true), 4800);
    const t4 = setTimeout(() => onComplete(), 5400);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [onComplete]);

  function skip() {
    setFading(true);
    setTimeout(() => onComplete(), 600);
  }

  return (
    <div style={styles.wrapper(fading)}>
      <div style={styles.scanline} />
      <div style={styles.logoWrap}>
        <img src="/laborlens-logo.svg" alt="LaborLens" width={320} />
        <div style={styles.arc} />
        <div style={styles.ripple} />
      </div>
      <p style={styles.tagline(showTagline)}>Investigate labor risk in minutes</p>
      <p style={styles.ready(showReady)}>● Every second counts.</p>
      <div style={styles.bar} />
      <button style={styles.skip} onClick={skip}>Skip ›</button>
      <style>{keyframes}</style>
    </div>
  );
}

const styles = {
  wrapper: (fading: boolean) => ({
    position: 'fixed' as const,
    inset: 0,
    background: '#000',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    opacity: fading ? 0 : 1,
    transition: 'opacity 0.6s ease',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  }),
  scanline: {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0,
    height: '1px',
    background: 'rgba(109,200,160,0.5)',
    opacity: 0,
    animation: 'scan 2.2s ease-in-out forwards',
  },
  logoWrap: {
    position: 'relative' as const,
    width: 320,
    opacity: 0,
    animation: 'logoReveal 0.9s cubic-bezier(0.34,1.2,0.64,1) 0.5s forwards',
  },
  arc: {
    position: 'absolute' as const,
    top: '50%', left: '50%',
    width: 80, height: 80,
    marginTop: -40, marginLeft: -104,
    borderRadius: '50%',
    border: '2px solid transparent',
    borderTopColor: '#6DC8A0',
    opacity: 0,
    animation: 'arcSpin 1.4s cubic-bezier(0.4,0,0.2,1) 0.9s forwards',
  },
  ripple: {
    position: 'absolute' as const,
    top: '50%', left: '50%',
    width: 80, height: 80,
    marginTop: -40, marginLeft: -104,
    borderRadius: '50%',
    border: '1px solid rgba(109,200,160,0.4)',
    opacity: 0,
    animation: 'ripple 1.6s ease 1.4s forwards',
  },
  tagline: (visible: boolean) => ({
    marginTop: 28,
    fontSize: 13,
    letterSpacing: '4px',
    textTransform: 'uppercase' as const,
    color: 'rgba(109,200,160,0.6)',
    textAlign: 'center' as const,
    width: 320,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(8px)',
    transition: 'opacity 0.5s ease, transform 0.5s ease',
  }),
  ready: (visible: boolean) => ({
    marginTop: 16,
    fontSize: 11,
    letterSpacing: '3px',
    textTransform: 'uppercase' as const,
    color: 'rgba(109,200,160,0.65)',
    textAlign: 'center' as const,
    width: 320,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 0.5s ease, transform 0.5s ease',
  }),
  bar: {
    position: 'absolute' as const,
    bottom: 0, left: 0,
    height: 2, width: 0,
    background: 'linear-gradient(90deg, transparent, #6DC8A0 40%, transparent)',
    animation: 'grow 3.4s ease 0.5s forwards',
  },
  skip: {
    position: 'absolute' as const,
    bottom: 24, right: 28,
    fontSize: 11,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.2)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    opacity: 0,
    animation: 'fadeIn 0.5s ease 1.2s forwards',
    transition: 'color 0.2s',
  },
};

const keyframes = `
  @keyframes scan {
    0%   { top: 0%;   opacity: 0.9; }
    100% { top: 100%; opacity: 0;   }
  }
  @keyframes logoReveal {
    from { opacity: 0; transform: scale(0.88); }
    to   { opacity: 1; transform: scale(1);   }
  }
  @keyframes arcSpin {
    0%   { opacity: 0; transform: rotate(0deg); }
    15%  { opacity: 1; }
    100% { opacity: 0; transform: rotate(400deg); }
  }
  @keyframes ripple {
    0%   { transform: scale(1);   opacity: 0.6; }
    100% { transform: scale(2.8); opacity: 0;   }
  }
  @keyframes grow {
    from { width: 0; }
    to   { width: 100%; }
  }
  @keyframes fadeIn {
    to { opacity: 1; }
  }
`;