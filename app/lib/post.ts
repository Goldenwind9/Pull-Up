// Tiny fetch helper for client components: POST and get back data or a friendly error.
export async function post<T = unknown>(
  url: string,
  body?: FormData | Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      ...(body instanceof FormData
        ? { body }
        : body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong. Try again!" };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "No connection. Try again!" };
  }
}
