"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTokens, type Token } from "./lib/hooks/use-tokens";
import { useAggregateHolderCount } from "./lib/hooks/use-holder-count";
import { TokenCard } from "./components/token-card";
import { priceInSol, marketCapUsd } from "./lib/bonding-curve";
import { formatUsd, formatPriceSol, formatTokenAmount } from "./lib/format";

const SORTS = ["Trending", "Newest", "Top MCap", "Most Holders", "Price ▲"] as const;
type Sort = (typeof SORTS)[number];

function sortTokens(tokens: Token[], sort: Sort): Token[] {
  const copy = [...tokens];
  switch (sort) {
    case "Newest":
      return copy.sort((a, b) => Number(b.createdAt - a.createdAt));
    case "Top MCap":
      return copy.sort(
        (a, b) =>
          marketCapUsd(b.virtualSolReserves, b.virtualTokenReserves, b.tokenTotalSupply) -
          marketCapUsd(a.virtualSolReserves, a.virtualTokenReserves, a.tokenTotalSupply)
      );
    case "Price ▲":
      return copy.sort(
        (a, b) =>
          priceInSol(a.virtualSolReserves, a.virtualTokenReserves) -
          priceInSol(b.virtualSolReserves, b.virtualTokenReserves)
      );
    case "Most Holders":
      // Falls back to trending ordering client-side; holder counts load per-card.
      return copy.sort((a, b) => Number(b.realSolReserves - a.realSolReserves));
    case "Trending":
    default:
      return copy.sort((a, b) => Number(b.realSolReserves - a.realSolReserves));
  }
}

const HERO_CHIP_GRADIENTS = [
  "linear-gradient(135deg,#ff9500,#ff2d78)",
  "linear-gradient(135deg,#14f195,#00b4ff)",
  "linear-gradient(135deg,#9945ff,#ff2d78)",
  "linear-gradient(135deg,#00b4ff,#9945ff)",
];

const HERO_CHIP_POSITIONS = [
  { className: "animate-floaty right-[60px] top-[120px]" },
  { className: "animate-floaty-delay right-[170px] top-[210px]" },
  { className: "animate-floaty-delay-2 right-[10px] top-[290px]" },
  { className: "animate-floaty-delay-3 right-[250px] top-[60px]" },
];

function HeroChip({ token, gradient }: { token: Token; gradient: string }) {
  const price = priceInSol(token.virtualSolReserves, token.virtualTokenReserves);
  return (
    <Link
      href={`/token/${token.mint}`}
      className="flex items-center gap-2.5 rounded-[13px] border border-white/10 bg-white/[0.06] px-3.5 py-2.5 backdrop-blur"
    >
      <span className="h-[22px] w-[22px] rounded-full" style={{ background: gradient }} />
      <span className="font-mono text-xs font-bold">${token.symbol}</span>
      <span className="font-mono text-[11px] font-semibold text-[#14f195]">
        {formatPriceSol(price)}
      </span>
    </Link>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExploreContent />
    </Suspense>
  );
}

function ExploreContent() {
  const { tokens, isLoading } = useTokens();
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").toLowerCase().trim();
  const [sort, setSort] = useState<Sort>("Trending");

  const { total: totalHolders } = useAggregateHolderCount(tokens.map((t) => t.mint));

  const filtered = useMemo(() => {
    const base = query
      ? tokens.filter(
          (t) =>
            t.name.toLowerCase().includes(query) || t.symbol.toLowerCase().includes(query)
        )
      : tokens;
    return sortTokens(base, sort);
  }, [tokens, query, sort]);

  const totalMarketCap = tokens.reduce(
    (sum, t) => sum + marketCapUsd(t.virtualSolReserves, t.virtualTokenReserves, t.tokenTotalSupply),
    0
  );
  const totalRaised = tokens.reduce((sum, t) => sum + Number(t.realSolReserves) / 1e9, 0);

  const stats = [
    { icon: "🚀", label: "Tokens launched", value: formatTokenAmount(tokens.length) },
    { icon: "💰", label: "Total market cap", value: formatUsd(totalMarketCap) },
    { icon: "◎", label: "SOL raised", value: formatPriceSol(totalRaised) },
    {
      icon: "👥",
      label: "Total holders",
      value: totalHolders != null ? formatTokenAmount(totalHolders) : "…",
    },
  ];

  const heroChips = [...tokens]
    .sort((a, b) => Number(b.realSolReserves - a.realSolReserves))
    .slice(0, 4);

  return (
    <div className="animate-fadeup">
      {/* HERO */}
      <div className="relative mx-auto max-w-[1240px] overflow-hidden px-8 pb-5 pt-14">
        {heroChips.map((token, i) => (
          <div
            key={token.mint}
            className={`absolute hidden lg:block ${HERO_CHIP_POSITIONS[i].className}`}
          >
            <HeroChip token={token} gradient={HERO_CHIP_GRADIENTS[i]} />
          </div>
        ))}

        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[rgba(20,241,149,.25)] bg-[rgba(20,241,149,.1)] px-3 py-1.5">
          <span
            className="animate-pulseglow h-1.5 w-1.5 rounded-full"
            style={{ background: "#14f195", boxShadow: "0 0 8px #14f195" }}
          />
          <span className="font-mono text-[11px] font-medium text-[#14f195]">
            {tokens.length} token{tokens.length === 1 ? "" : "s"} live · trading now
          </span>
        </div>
        <h1 className="m-0 max-w-[640px] text-[42px] font-bold leading-[1.05] tracking-tight sm:text-[60px]">
          Launch your token on{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(120deg,#b98cff,#14f195)" }}
          >
            Solana
          </span>
        </h1>
        <p className="mb-7 mt-4 max-w-[460px] text-base leading-relaxed text-white/60">
          Create and trade SPL tokens instantly. No code, no backend — every token is priced by a
          transparent on-chain bonding curve.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/create"
            className="rounded-[14px] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_28px_rgba(153,69,255,.4)]"
            style={{ background: "linear-gradient(135deg,#9945ff,#7d2dff)" }}
          >
            Create Token →
          </Link>
          <a
            href="#grid"
            className="rounded-[14px] border border-white/[0.14] bg-white/[0.06] px-6.5 py-3.5 text-[15px] font-semibold text-white"
          >
            Explore Tokens
          </a>
        </div>
      </div>

      {/* STATS */}
      <div className="mx-auto max-w-[1240px] px-8 pt-9">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border-low bg-white/[0.03] px-5.5 py-5.5"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-base">{s.icon}</span>
                <span className="text-[12.5px] text-white/50">{s.label}</span>
              </div>
              <div className="font-mono text-[26px] font-bold tracking-tight sm:text-[28px]">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MARKETPLACE */}
      <div id="grid" className="mx-auto max-w-[1240px] px-8 py-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3.5">
          <h2 className="m-0 text-2xl font-bold tracking-tight">Token Marketplace</h2>
          <div className="flex flex-wrap gap-1.5">
            {SORTS.map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`cursor-pointer rounded-full border px-3.5 py-2 text-[12.5px] font-medium ${
                  sort === s
                    ? "border-[rgba(153,69,255,.4)] bg-[rgba(153,69,255,.15)] text-[#b98cff]"
                    : "border-border-low bg-white/[0.03] text-white/60"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-shimmer h-[210px] rounded-[14px] border border-white/[0.06]"
                style={{
                  background: "linear-gradient(90deg,#0e0f16,#181a24,#0e0f16)",
                }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border-low bg-white/[0.03] px-6 py-16 text-center text-white/50">
            {tokens.length === 0
              ? "No tokens have launched yet — be the first."
              : "No tokens match your search."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((t) => (
              <TokenCard key={t.mint} token={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
