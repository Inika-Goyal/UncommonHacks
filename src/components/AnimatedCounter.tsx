"use client";

import React, { useEffect, useState } from "react";

type Props = {
  values?: number[];
  intervalMs?: number;
};

export default function AnimatedCounter({ values = [50, 60, 70], intervalMs = 1400 }: Props) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const curr = values[index % values.length];
  const animMs = 600;

  useEffect(() => {
    const id = setInterval(() => {
      setPrev(curr);
      setIndex((i) => (i + 1) % values.length);
      // clear prev after animation finishes
      setTimeout(() => setPrev(null), animMs);
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, intervalMs]);

  return (
    <span style={{ display: "inline-block", verticalAlign: "middle" }}>
      <span style={{ position: "relative", display: "inline-block", width: "4ch", height: "1.05em", overflow: "hidden" }}>
        {prev !== null ? (
          <span
            key={`prev-${prev}`}
            className="animated-number exit"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {prev}
          </span>
        ) : null}

        <span
          key={`curr-${curr}`}
          className={`animated-number enter`}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {curr}
        </span>
      </span>

      <style>{`
        .animated-number.enter { animation: flyIn ${animMs}ms ease forwards; }
        .animated-number.exit { animation: flyOut ${animMs}ms ease forwards; }
        @keyframes flyIn { from { transform: translateY(18px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes flyOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-18px); opacity: 0; } }
      `}</style>
    </span>
  );
}
