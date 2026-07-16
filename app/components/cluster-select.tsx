"use client";

import { useCluster } from "./cluster-context";
import { PingDot } from "./ping-dot";

// The launchpad program is only deployed on devnet, so there's nothing meaningful to switch
// to — this is a static status indicator rather than a cluster picker.
export function ClusterSelect() {
  const { cluster } = useCluster();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[rgba(20,241,149,.25)] bg-[rgba(20,241,149,.1)] px-3 py-2 text-xs font-medium text-[#14f195]">
      <PingDot size={7} />
      <span className="capitalize">{cluster}</span>
    </div>
  );
}
