export function PingDot({ color = "#14f195", size = 7 }: { color?: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ height: size, width: size }}>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
        style={{ background: color }}
      />
      <span
        className="relative inline-flex h-full w-full rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </span>
  );
}
