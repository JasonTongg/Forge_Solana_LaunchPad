"use client";

import { useEffect, useState } from "react";

/**
 * Current time in epoch seconds, refreshed on an interval. `Date.now()` is
 * impure, so it's only ever read inside an effect — never during render.
 */
export function useNowSeconds(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
