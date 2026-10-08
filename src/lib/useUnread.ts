"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { AppNotification, UnreadItem } from "./types";

export interface UnreadState {
  items: UnreadItem[];
  notifications: AppNotification[];
  unreadNotifications: number;
}

const EMPTY: UnreadState = { items: [], notifications: [], unreadNotifications: 0 };

/** غير المقروء + الإشعارات من السيرفر — كل 15 ثانية والصفحة ظاهرة */
export function useUnread(enabled: boolean) {
  const [state, setState] = useState<UnreadState>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await api<UnreadState>("/unread");
        if (alive) setState(r);
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

  return state;
}

export const refreshUnread = () => window.dispatchEvent(new Event("bs:unread-refresh"));
