import { getBase58Decoder, getBase64Encoder, type Address } from "@solana/kit";

// Anchor's `emit!(TradeEvent { .. })` discriminator: sha256("event:TradeEvent")[..8].
// Codama doesn't generate event decoders, so this fixed-layout struct is decoded by hand.
const TRADE_EVENT_DISCRIMINATOR = new Uint8Array([189, 219, 127, 211, 78, 230, 97, 238]);
const TRADE_EVENT_BYTE_LENGTH = 8 + 32 + 32 + 1 + 8 * 9;

export type TradeEvent = {
  mint: Address;
  trader: Address;
  isBuy: boolean;
  solAmount: bigint;
  tokenAmount: bigint;
  creatorFee: bigint;
  protocolFee: bigint;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  timestamp: bigint;
};

function decodeTradeEvent(bytes: Uint8Array): TradeEvent | null {
  if (bytes.length !== TRADE_EVENT_BYTE_LENGTH) return null;
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== TRADE_EVENT_DISCRIMINATOR[i]) return null;
  }

  const base58Decoder = getBase58Decoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 8;
  const mint = base58Decoder.decode(bytes.subarray(offset, offset + 32)) as Address;
  offset += 32;
  const trader = base58Decoder.decode(bytes.subarray(offset, offset + 32)) as Address;
  offset += 32;
  const isBuy = view.getUint8(offset) === 1;
  offset += 1;

  const readU64 = () => {
    const value = view.getBigUint64(offset, true);
    offset += 8;
    return value;
  };
  const readI64 = () => {
    const value = view.getBigInt64(offset, true);
    offset += 8;
    return value;
  };

  const solAmount = readU64();
  const tokenAmount = readU64();
  const creatorFee = readU64();
  const protocolFee = readU64();
  const virtualSolReserves = readU64();
  const virtualTokenReserves = readU64();
  const realSolReserves = readU64();
  const realTokenReserves = readU64();
  const timestamp = readI64();

  return {
    mint,
    trader,
    isBuy,
    solAmount,
    tokenAmount,
    creatorFee,
    protocolFee,
    virtualSolReserves,
    virtualTokenReserves,
    realSolReserves,
    realTokenReserves,
    timestamp,
  };
}

const PROGRAM_DATA_PREFIX = "Program data: ";
const base64Encoder = getBase64Encoder();

/** Extracts every `TradeEvent` logged by the launchpad program in a transaction. */
export function extractTradeEvents(logMessages: readonly string[] | null): TradeEvent[] {
  if (!logMessages) return [];
  const events: TradeEvent[] = [];
  for (const line of logMessages) {
    if (!line.startsWith(PROGRAM_DATA_PREFIX)) continue;
    const base64Payload = line.slice(PROGRAM_DATA_PREFIX.length).trim();
    if (!base64Payload) continue;
    try {
      const bytes = new Uint8Array(base64Encoder.encode(base64Payload));
      const event = decodeTradeEvent(bytes);
      if (event) events.push(event);
    } catch {
      // not a base64 payload we can decode, ignore
    }
  }
  return events;
}
