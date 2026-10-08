"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { UnreadItem } from "./types";

/** غير المقروء من السيرفر — بيتحدّث كل 15 ثانية والصفحة ظاهرة */
export function useUnread(enabled: boolean) {
  const [items, setItems] = useState<UnreadItem[]>([]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await api<{ items: UnreadItem[] }>("/unread");
        if (alive) setItems(r.items);
      } catch {
        /* تجاهل */
      }
    };
    load();
    const t = setInterval(load, 15000);
    const onVis = () => load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("bs:unread-refresh", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("bs:unread-refresh", onVis);
    };
  }, [enabled]);

  return items;
}

export const refreshUnread = () => window.dispatchEvent(new Event("bs:unread-refresh"));
