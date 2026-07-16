"use client";

import { useMemo, useState } from "react";
import type { TimedTradeEvent } from "../lib/hooks/use-trade-history";
import { useNowSeconds } from "../lib/hooks/use-now-seconds";
import { priceInSol } from "../lib/bonding-curve";
import { buildPolyline } from "../lib/polyline";

const RANGES = ["1H", "24H", "7D", "30D", "All"] as const;
type Range = (typeof RANGES)[number];

const RANGE_SECONDS: Record<Range, number | null> = {
  "1H": 3600,
  "24H": 86_400,
  "7D": 7 * 86_400,
  "30D": 30 * 86_400,
  All: null,
};

export function PriceChart({
  trades,
  currentPriceSol,
}: {
  trades: TimedTradeEvent[];
  currentPriceSol: number;
}) {
  const [range, setRange] = useState<Range>("24H");
  const nowSec = useNowSeconds();

  const { pricePoints, volumeBuckets } = useMemo(() => {
    const windowSeconds = RANGE_SECONDS[range];
    const cutoff = windowSeconds != null ? nowSec - windowSeconds : 0;

    const ordered = trades
      .filter((t) => (t.blockTime ?? 0) >= cutoff)
      .slice()
      .sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));

    const points = ordered.map((t) => priceInSol(t.virtualSolReserves, t.virtualTokenReserves));
    points.push(currentPriceSol);

    const BUCKET_COUNT = 16;
    const buckets = new Array(BUCKET_COUNT).fill(0);
    if (ordered.length > 0) {
      const start = ordered[0].blockTime ?? nowSec;
      const span = Math.max(1, nowSec - start);
      for (const t of ordered) {
        const frac = ((t.blockTime ?? nowSec) - start) / span;
        const idx = Math.min(BUCKET_COUNT - 1, Math.max(0, Math.floor(frac * BUCKET_COUNT)));
        buckets[idx] += Number(t.solAmount) / 1_000_000_000;
      }
    }

    return { pricePoints: points, volumeBuckets: buckets };
  }, [trades, range, currentPriceSol, nowSec]);

  const linePoints = buildPolyline(pricePoints, 640, 240, 6);
  const areaPoints = linePoints ? `0,240 ${linePoints} 640,240` : "";
  const maxVolume = Math.max(...volumeBuckets, 0.0001);

  return (
    <div className="rounded-2xl border border-input bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-mono text-[26px] font-bold">{currentPriceSol.toFixed(6)} ◎</div>
        </div>
        <div className="flex gap-1 rounded-[11px] bg-white/[0.04] p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 font-mono text-xs font-semibold ${
                range === r ? "bg-[#9945ff] text-white" : "text-white/50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox="0 0 640 240" className="block h-[230px] w-full">
        <defs>
          <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(20,241,149,.28)" />
            <stop offset="1" stopColor="rgba(20,241,149,0)" />
          </linearGradient>
        </defs>
        {areaPoints && <polyline points={areaPoints} fill="url(#chart-area)" stroke="none" />}
        {linePoints && (
          <polyline
            points={linePoints}
            fill="none"
            stroke="#14f195"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )}
      </svg>

      <svg viewBox="0 0 640 50" className="mt-1.5 block h-[46px] w-full">
        <g fill="rgba(153,69,255,.5)">
          {volumeBuckets.map((v, i) => {
            const barWidth = 640 / volumeBuckets.length - 6;
            const h = Math.max(2, (v / maxVolume) * 44);
            return (
              <rect
                key={i}
                x={i * (640 / volumeBuckets.length) + 3}
                y={50 - h}
                width={barWidth}
                height={h}
                rx={2}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
