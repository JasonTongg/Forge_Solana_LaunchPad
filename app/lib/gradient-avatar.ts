function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Deterministic CSS gradient derived from an address, used as a token's logo/banner. */
export function gradientForAddress(address: string): string {
  const hash = hashString(address);
  const hue1 = hash % 360;
  const hue2 = (hue1 + 70 + (hash % 40)) % 360;
  const angle = 120 + (hash % 60);
  return `linear-gradient(${angle}deg, hsl(${hue1} 85% 62%), hsl(${hue2} 85% 55%))`;
}
