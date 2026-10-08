// عميل الـ API — كل الطلبات بتمشي لنفس الدومين (‎/api) بالكوكي.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | number | undefined | null> } = {}
): Promise<T> {
  const qs = opts.query
    ? "?" +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs === "?" ? "" : qs}`, {
      method: opts.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "x-bs-client": "1",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "ما في اتصال بالإنترنت — جرّب تاني");
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ردود فاضية */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || "حصل خطأ، جرّب تاني");
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "حصل خطأ");
