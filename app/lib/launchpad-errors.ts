import { isSolanaError, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM } from "@solana/kit";
import {
  LAUNCHPAD_ERROR__ALLOCATION_TOO_HIGH,
  LAUNCHPAD_ERROR__DESCRIPTION_TOO_LONG,
  LAUNCHPAD_ERROR__INSUFFICIENT_LIQUIDITY,
  LAUNCHPAD_ERROR__INVALID_AMOUNT,
  LAUNCHPAD_ERROR__INVALID_CURVE_KIND,
  LAUNCHPAD_ERROR__INVALID_PRICE,
  LAUNCHPAD_ERROR__INVALID_SUPPLY,
  LAUNCHPAD_ERROR__LINK_TOO_LONG,
  LAUNCHPAD_ERROR__MATH_OVERFLOW,
  LAUNCHPAD_ERROR__NAME_TOO_LONG,
  LAUNCHPAD_ERROR__SLIPPAGE_EXCEEDED,
  LAUNCHPAD_ERROR__SOLD_OUT,
  LAUNCHPAD_ERROR__SYMBOL_TOO_LONG,
  type LaunchpadError,
} from "../generated/launchpad";

// Hardcoded (not the Codama-generated getLaunchpadErrorMessage) so these read
// correctly in production bundles too — Codama only keeps error text in dev builds.
const LAUNCHPAD_ERROR_MESSAGES: Record<LaunchpadError, string> = {
  [LAUNCHPAD_ERROR__NAME_TOO_LONG]: "Token name must be 1-32 characters.",
  [LAUNCHPAD_ERROR__SYMBOL_TOO_LONG]: "Token symbol must be 1-10 characters.",
  [LAUNCHPAD_ERROR__DESCRIPTION_TOO_LONG]: "Description must be 200 characters or fewer.",
  [LAUNCHPAD_ERROR__LINK_TOO_LONG]: "Link fields must be 64 characters or fewer.",
  [LAUNCHPAD_ERROR__INVALID_CURVE_KIND]: "Invalid bonding curve type.",
  [LAUNCHPAD_ERROR__ALLOCATION_TOO_HIGH]: "Creator allocation cannot exceed 20% of supply.",
  [LAUNCHPAD_ERROR__INVALID_PRICE]: "Initial price must be greater than zero.",
  [LAUNCHPAD_ERROR__INVALID_SUPPLY]: "Total supply is out of the allowed range.",
  [LAUNCHPAD_ERROR__INSUFFICIENT_LIQUIDITY]:
    "Not enough SOL in this curve to cover that sale yet — tokens from the creator allocation aren't backed by real reserves until someone buys them.",
  [LAUNCHPAD_ERROR__INVALID_AMOUNT]: "Amount must be greater than zero.",
  [LAUNCHPAD_ERROR__SLIPPAGE_EXCEEDED]:
    "Price moved more than your slippage tolerance allows. Try again.",
  [LAUNCHPAD_ERROR__SOLD_OUT]: "This token's bonding curve is sold out.",
  [LAUNCHPAD_ERROR__MATH_OVERFLOW]: "That amount is too large to process.",
};

export function parseLaunchpadError(err: unknown): string {
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }

  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    const message = LAUNCHPAD_ERROR_MESSAGES[err.context.code as LaunchpadError];
    if (message) return message;
  }

  const message = getDeepestMessage(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;

  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) {
      deepest = current.message;
    }
  }

  return deepest;
}
