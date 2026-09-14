"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isUnread } from "@/lib/notifications";
import type { Conversation } from "@/lib/types";

interface LastMessageInfo {
  created_at: string;
  sender_phone: string;
}

export interface UnreadItem {
  conversation: Conversation;
  lastMessageAt: string;
}

/**
 * Hook مشترك يرجع قائمة المحادثات غير المقروءة لصاحب رقم الهاتف —
 * يُستخدم في جرس الإشعارات وفي شارة "محادثاتي".
 */
export function useUnreadConversations(phone: string | null) {
  const [items, setItems] = useState<UnreadItem[]>([]);

  useEffect(() => {
    if (!phone) {
      setItems([]);
      return;
    }

    const check = async () => {
      const { data: convs } = await supabase
        .from("conversations")
        .select("*, listing:listings(*)")
        .or(`buyer_phone.eq.${phone},seller_phone.eq.${phone}`)
        .order("updated_at", { ascending: false });

      const list = (convs as unknown as Conversation[]) || [];
      if (list.length === 0) {
        setItems([]);
        return;
      }

      const ids = list.map((c) => c.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, sender_phone, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: true });

      const lastByConv: Record<string, LastMessageInfo> = {};
      (msgs || []).forEach((m: any) => {
        lastByConv[m.conversation_id] = { created_at: m.created_at, sender_phone: m.sender_phone };
      });

      const unreadItems: UnreadItem[] = list
        .filter((conv) => {
          const last = lastByConv[conv.id];
          return isUnread(conv.id, last?.created_at, last?.sender_phone, phone);
        })
        .map((conv) => ({ conversation: conv, lastMessageAt: lastByConv[conv.id]?.created_at }))
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

      setItems(unreadItems);
    };

    check();
    const interval = setInterval(check, 6000);

    const channel = supabase
      .channel(`unread-watcher-${phone}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, check)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, check)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [phone]);

  return items;
}
