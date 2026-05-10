"use client";

import { useEffect, useState } from "react";
import { CLOUD_DATA_RESYNC_EVENT } from "@/lib/cloud-resync";

/** Counter bertambah setiap pemanggilan muat-ulang-data global → masuk dependency useEffect fetch. */
export function useCloudDataResyncTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    window.addEventListener(CLOUD_DATA_RESYNC_EVENT, fn as EventListener);
    return () => window.removeEventListener(CLOUD_DATA_RESYNC_EVENT, fn as EventListener);
  }, []);
  return tick;
}
