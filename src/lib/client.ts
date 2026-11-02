"use client";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  try {
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: isForm
        ? options.headers
        : { "Content-Type": "application/json", ...(options.headers ?? {}) },
      body: isForm ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : null) ||
        (typeof payload === "string" && payload ? payload : null) ||
        `Permintaan gagal (status ${response.status}).`;
      return { ok: false, error: message, status: response.status };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Terjadi kesalahan jaringan.",
    };
  }
}

export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
