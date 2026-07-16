/**
 * Pure TS mirror of the constant-product bonding curve math in
 * anchor/programs/launchpad/src/lib.rs. Used for instant client-side
 * previews (Create's live preview, the trading panel) without a round trip.
 */

export const TOKEN_DECIMALS = 6;
export const TOKEN_SCALE = 1_000_000n; // 10 ** TOKEN_DECIMALS
export const DEFAULT_TOTAL_SUPPLY_WHOLE_TOKENS = 1_000_000_000n;
export const MIN_TOTAL_SUPPLY_WHOLE_TOKENS = 1_000n;
export const MAX_TOTAL_SUPPLY_WHOLE_TOKENS = 100_000_000_000n;
export const PLATFORM_FEE_BPS = 100n; // 1%
export const CREATOR_FEE_SHARE_BPS = 5_000n; // 50% of the fee
export const MAX_CREATOR_ALLOC_BPS = 2_000; // 20%
export const BPS_DENOMINATOR = 10_000n;

// Kept in sync with the cushion ratios in create_token: exponential gets a
// small virtual cushion (steep), linear gets a large one (flat).
const CUSHION = {
  linear: { num: 3n, den: 1n },
  exponential: { num: 27n, den: 20n },
} as const;

export type CurveKind = 0 | 1;

export function creatorAllocAmount(totalSupply: bigint, creatorAllocBps: number): bigint {
  return (totalSupply * BigInt(creatorAllocBps)) / BPS_DENOMINATOR;
}

export function initialReserves(
  curveKind: CurveKind,
  totalSupply: bigint,
  creatorAllocBps: number,
  initialPriceLamports: bigint
): { virtualSolReserves: bigint; virtualTokenReserves: bigint; sellable: bigint } {
  const sellable = totalSupply - creatorAllocAmount(totalSupply, creatorAllocBps);
  const { num, den } = curveKind === 1 ? CUSHION.exponential : CUSHION.linear;
  const virtualTokenReserves = (sellable * num) / den;
  const virtualSolReserves = (initialPriceLamports * virtualTokenReserves) / TOKEN_SCALE;
  return { virtualSolReserves, virtualTokenReserves, sellable };
}

export function feeAmount(amount: bigint): bigint {
  return (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
}

export function creatorShare(fee: bigint): bigint {
  return (fee * CREATOR_FEE_SHARE_BPS) / BPS_DENOMINATOR;
}

export type BuyQuote = {
  tokensOut: bigint;
  creatorFee: bigint;
  protocolFee: bigint;
  netSolIn: bigint;
  newVirtualSolReserves: bigint;
  newVirtualTokenReserves: bigint;
};

export function quoteBuy(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint,
  solIn: bigint
): BuyQuote {
  if (solIn <= 0n) {
    return {
      tokensOut: 0n,
      creatorFee: 0n,
      protocolFee: 0n,
      netSolIn: 0n,
      newVirtualSolReserves: virtualSolReserves,
      newVirtualTokenReserves: virtualTokenReserves,
    };
  }
  const fee = feeAmount(solIn);
  const creatorFee = creatorShare(fee);
  const protocolFee = fee - creatorFee;
  const netSolIn = solIn - fee;

  const k = virtualSolReserves * virtualTokenReserves;
  const newVirtualSolReserves = virtualSolReserves + netSolIn;
  const newVirtualTokenReserves = k / newVirtualSolReserves;
  const tokensOut = virtualTokenReserves - newVirtualTokenReserves;

  return {
    tokensOut,
    creatorFee,
    protocolFee,
    netSolIn,
    newVirtualSolReserves,
    newVirtualTokenReserves,
  };
}

export type SellQuote = {
  solOutGross: bigint;
  solOutNet: bigint;
  creatorFee: bigint;
  protocolFee: bigint;
  newVirtualSolReserves: bigint;
  newVirtualTokenReserves: bigint;
};

export function quoteSell(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint,
  tokenIn: bigint
): SellQuote {
  if (tokenIn <= 0n) {
    return {
      solOutGross: 0n,
      solOutNet: 0n,
      creatorFee: 0n,
      protocolFee: 0n,
      newVirtualSolReserves: virtualSolReserves,
      newVirtualTokenReserves: virtualTokenReserves,
    };
  }
  const k = virtualSolReserves * virtualTokenReserves;
  const newVirtualTokenReserves = virtualTokenReserves + tokenIn;
  const newVirtualSolReserves = k / newVirtualTokenReserves;
  const solOutGross = virtualSolReserves - newVirtualSolReserves;

  const fee = feeAmount(solOutGross);
  const creatorFee = creatorShare(fee);
  const protocolFee = fee - creatorFee;
  const solOutNet = solOutGross - fee;

  return {
    solOutGross,
    solOutNet,
    creatorFee,
    protocolFee,
    newVirtualSolReserves,
    newVirtualTokenReserves,
  };
}

/** Applies a slippage tolerance (in bps) to a quoted amount, rounding down. */
export function withSlippage(amount: bigint, toleranceBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, toleranceBps)));
  return (amount * (BPS_DENOMINATOR - bps)) / BPS_DENOMINATOR;
}

/** Price of one whole token, in SOL. */
export function priceInSol(virtualSolReserves: bigint, virtualTokenReserves: bigint): number {
  if (virtualTokenReserves === 0n) return 0;
  const solPerBaseUnit = Number(virtualSolReserves) / 1_000_000_000 / Number(virtualTokenReserves);
  return solPerBaseUnit * Number(TOKEN_SCALE);
}

/** Rough SOL->USD conversion for display only (no live price oracle in this app). */
export const SOL_USD_ESTIMATE = 140;

export function marketCapUsd(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint,
  totalSupply: bigint
): number {
  const price = priceInSol(virtualSolReserves, virtualTokenReserves);
  const wholeSupply = Number(totalSupply) / Number(TOKEN_SCALE);
  return price * wholeSupply * SOL_USD_ESTIMATE;
}

export function toWholeTokens(baseUnits: bigint): number {
  return Number(baseUnits) / Number(TOKEN_SCALE);
}

export function toBaseUnits(wholeTokens: number): bigint {
  return BigInt(Math.round(wholeTokens * Number(TOKEN_SCALE)));
}
