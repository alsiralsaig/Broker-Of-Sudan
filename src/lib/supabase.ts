import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** وضع المعاينة بدون متغيرات بيئة: عميل وهمي يرجع نتايج آمنة بدل ما يكسر الصفحة */
function makeStub(): SupabaseClient {
  const result = {
    data: null,
    error: { message: "وضع المعاينة: قاعدة البيانات غير مربوطة" },
  };
  const proxy: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (res: any) => Promise.resolve(result).then(res);
      }
      return () => proxy;
    },
  });
  const stub: any = {
    from: () => proxy,
    channel: () => proxy,
    removeChannel: () => {},
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: { message: "وضع المعاينة" } }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
  return stub as SupabaseClient;
}

export const supabase: SupabaseClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : (console.warn("[سمسار السودان] متغيرات Supabase غير مضبوطة — شغال بوضع المعاينة"), makeStub());
