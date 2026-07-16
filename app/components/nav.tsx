"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClusterSelect } from "./cluster-select";
import { WalletButton } from "./wallet-button";

const NAV_ITEMS = [
  { label: "Explore", href: "/" },
  { label: "Create", href: "/create" },
  { label: "Portfolio", href: "/portfolio" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = search.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  return (
    <nav className="sticky top-0 z-40 flex items-center gap-5 border-b border-border-low bg-[rgba(8,9,13,.72)] px-4 py-4 backdrop-blur-md sm:px-8">
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <div
          className="h-[26px] w-[26px] rotate-45 rounded-[7px]"
          style={{
            background: "linear-gradient(135deg,#9945ff,#14f195)",
            boxShadow: "0 0 16px rgba(153,69,255,.6)",
          }}
        />
        <span
          className="text-[21px] font-bold tracking-tight"
          style={{ fontFamily: "var(--font-unbounded)" }}
        >
          Forge
        </span>
      </Link>

      <div className="hidden gap-1 sm:ml-3 sm:flex">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[9px] px-3.5 py-2 text-[13.5px] font-medium transition ${
                active ? "bg-white/[0.08] text-white" : "text-white/55 hover:text-white/80"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="relative mx-auto hidden max-w-[340px] flex-1 md:block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-white/35">
          ⌕
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search token name or symbol"
          className="w-full rounded-[11px] border border-border-low bg-white/[0.04] py-2.5 pl-8 pr-3.5 text-[13px] text-white"
        />
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <ClusterSelect />
        <WalletButton />
      </div>
    </nav>
  );
}
