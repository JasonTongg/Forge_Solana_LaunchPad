"use client";

import Link from "next/link";
import type { Token } from "../lib/hooks/use-tokens";
import { useHolderCount } from "../lib/hooks/use-holder-count";
import { useTradeHistory } from "../lib/hooks/use-trade-history";
import { priceInSol, marketCapUsd } from "../lib/bonding-curve";
import {
  formatPriceSol,
  formatUsd,
  formatAge,
  formatImpactPct,
  formatPct,
  formatTokenAmount,
} from "../lib/format";
import { ellipsify } from "../lib/explorer";
import { gradientForAddress } from "../lib/gradient-avatar";
import { buildPolyline } from "../lib/polyline";

// Kept small — every card in the grid fetches its own history, so this bounds
// how many getTransaction calls the marketplace page fires at once.
const SPARKLINE_TRADE_LIMIT = 12;

export function TokenCard({ token }: { token: Token }) {
  const { holders } = useHolderCount(token.mint);
  const { trades } = useTradeHistory(token.mint, SPARKLINE_TRADE_LIMIT);

  const price = priceInSol(token.virtualSolReserves, token.virtualTokenReserves);
  const mcap = marketCapUsd(token.virtualSolReserves, token.virtualTokenReserves, token.tokenTotalSupply);
  const raised = Number(token.realSolReserves) / 1_000_000_000;

  const sold = token.initialRealTokenReserves - token.realTokenReserves;
  const pctSold =
    token.initialRealTokenReserves > 0n
      ? Number((sold * 10_000n) / token.initialRealTokenReserves) / 100
      : 0;

  const initialPrice = priceInSol(
    token.initialVirtualSolReserves,
    token.initialVirtualTokenReserves
  );
  const changeSinceLaunch = initialPrice > 0 ? ((price - initialPrice) / initialPrice) * 100 : 0;
  const changeColor = changeSinceLaunch >= 0 ? "#14f195" : "#ff4d6d";

  const sparklinePrices = [...trades]
    .sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0))
    .map((t) => priceInSol(t.virtualSolReserves, t.virtualTokenReserves));
  sparklinePrices.push(price);
  const sparklinePoints = buildPolyline(sparklinePrices, 270, 34, 2);

  return (
    <Link
      href={`/token/${token.mint}`}
      className="block rounded-[14px] border border-border-low bg-card p-[15px] transition hover:-translate-y-1 hover:border-[rgba(153,69,255,.5)] hover:shadow-[0_14px_34px_rgba(0,0,0,.5)]"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div
          className="h-[38px] w-[38px] shrink-0 rounded-[9px]"
          style={{ background: gradientForAddress(token.mint) }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{token.name}</div>
          <div className="truncate font-mono text-[11px] text-white/40">${token.symbol}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[13px] font-bold">{formatPriceSol(price)}</div>
          <div className="font-mono text-[11px] font-semibold" style={{ color: changeColor }}>
            {formatImpactPct(changeSinceLaunch)}
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-[9px] bg-white/[0.06]">
        <div className="bg-[#0e0f16] px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wide text-white/40">MCap</div>
          <div className="mt-0.5 font-mono text-xs font-bold">{formatUsd(mcap)}</div>
        </div>
        <div className="bg-[#0e0f16] px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wide text-white/40">Raised</div>
          <div className="mt-0.5 font-mono text-xs font-bold">{formatPriceSol(raised)}</div>
        </div>
        <div className="bg-[#0e0f16] px-2.5 py-2">
          <div className="text-[9px] uppercase tracking-wide text-white/40">Holders</div>
          <div className="mt-0.5 font-mono text-xs font-bold">
            {holders != null ? formatTokenAmount(holders) : "…"}
          </div>
        </div>
      </div>

      <svg viewBox="0 0 270 34" className="mb-2.5 block h-[30px] w-full">
        {sparklinePoints ? (
          <polyline
            points={sparklinePoints}
            fill="none"
            stroke={changeColor}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        ) : (
          <line x1="0" y1="17" x2="270" y2="17" stroke="rgba(255,255,255,.1)" strokeWidth={1.8} />
        )}
      </svg>

      <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full"
          style={{
            width: `${Math.min(100, Math.max(0, pctSold))}%`,
            background: "linear-gradient(90deg,#9945ff,#14f195)",
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-white/40">
        <span>{formatPct(pctSold)} sold</span>
        <span>
          by {ellipsify(token.creator, 4)} · {formatAge(Number(token.createdAt))}
        </span>
      </div>
    </Link>
  );
}
