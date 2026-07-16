"use client";

import type { TimedTradeEvent } from "../lib/hooks/use-trade-history";
import { priceInSol } from "../lib/bonding-curve";
import { formatTokenAmount, formatAge, formatSol } from "../lib/format";
import { ellipsify } from "../lib/explorer";

export function RecentTrades({ trades, symbol }: { trades: TimedTradeEvent[]; symbol: string }) {
  return (
    <div className="rounded-2xl border border-input bg-card p-5">
      <div className="mb-3.5 text-base font-bold">Recent Trades</div>
      <div className="grid grid-cols-[70px_1fr_1fr_1fr_70px] gap-2 border-b border-border-low pb-2.5 text-[10.5px] uppercase tracking-wide text-white/40">
        <span>Type</span>
        <span>Wallet</span>
        <span>Amount</span>
        <span>Price</span>
        <span className="text-right">Time</span>
      </div>
      {trades.length === 0 ? (
        <div className="py-8 text-center text-sm text-white/40">No trades yet — be the first.</div>
      ) : (
        trades.slice(0, 20).map((t) => {
          const price = priceInSol(t.virtualSolReserves, t.virtualTokenReserves);
          return (
            <div
              key={t.signature + t.mint}
              className="grid grid-cols-[70px_1fr_1fr_1fr_70px] items-center gap-2 border-b border-white/[0.04] py-2.5 font-mono text-[12.5px]"
            >
              <span className="font-bold" style={{ color: t.isBuy ? "#14f195" : "#ff4d6d" }}>
                {t.isBuy ? "BUY" : "SELL"}
              </span>
              <span className="text-white/60">{ellipsify(t.trader, 4)}</span>
              <span>
                {formatTokenAmount(Number(t.tokenAmount) / 1_000_000)} {symbol}
              </span>
              <span>{formatSol(price, 9)}</span>
              <span className="text-right text-white/40">
                {t.blockTime ? formatAge(t.blockTime) : "—"}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
