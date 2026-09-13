// تتبّع "آخر قراءة" لكل محادثة محلياً على جهاز المستخدم (بدون تعقيد خادم إضافي)
// تُستخدم لحساب عدد الرسائل غير المقروءة وإظهار إشعار داخل التطبيق (Badge)

const READ_PREFIX = "broker_last_read_";

export function getLastReadAt(conversationId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(READ_PREFIX + conversationId);
}

export function markConversationRead(conversationId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(READ_PREFIX + conversationId, new Date().toISOString());
}

/** هل فيه رسالة أحدث من آخر قراءة، ومش مرسلة من نفس المستخدم؟ */
export function isUnread(
  conversationId: string,
  lastMessageAt: string | null | undefined,
  lastMessageSender: string | null | undefined,
  myPhone: string
): boolean {
  if (!lastMessageAt || !lastMessageSender) return false;
  if (lastMessageSender === myPhone) return false; // آخر رسالة مني أنا، مفيش جديد يستنى قراءتي
  const lastRead = getLastReadAt(conversationId);
  if (!lastRead) return true;
  return new Date(lastMessageAt).getTime() > new Date(lastRead).getTime();
}
