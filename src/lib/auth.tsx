"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { syncPush } from "./push";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  setUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User | null }>("/auth/me");
      setUser(r.user);
    } catch {
      /* شبكة ضعيفة: نخلي الحالة زي ما هي */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ربط اشتراك الإشعارات بالحساب الداخل (لو الإذن موجود من قبل)
  useEffect(() => {
    if (user?.id) syncPush();
  }, [user?.id]);

  const logout = useCallback(async () => {
    try {
      // الجهاز ما يستلم إشعارات الحساب بعد الخروج
      const { disablePush } = await import("./push");
      await disablePush().catch(() => {});
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  return <Ctx.Provider value={{ user, loading, refresh, setUser, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
