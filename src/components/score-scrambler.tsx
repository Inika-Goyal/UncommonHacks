"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  durationMs?: number;
  className?: string;
};

const SCRAMBLE_CHARS = "0123456789";

export function ScoreScrambler({ value, durationMs = 900, className }: Props) {
  const [display, setDisplay] = useState<string>(String(value));
  const prev = useRef<number>(value);

  useEffect(() => {
    if (prev.current === value) {
      setDisplay(String(value));
      return;
    }
    const start = performance.now();
    const targetStr = String(value);
    const targetLen = targetStr.length;
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      // While scrambling, output random digits for trailing positions
      // and progressively lock in the target left-to-right.
      const lockedCount = Math.floor(eased * targetLen);
      let out = "";
      for (let i = 0; i < targetLen; i += 1) {
        if (i < lockedCount) {
          out += targetStr[i];
        } else {
          out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      setDisplay(out);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else {
        setDisplay(targetStr);
        prev.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={className}>{display}</span>;
}
