// Hardened client-side fetch: never assume the response is JSON.
// - Network failure -> ApiError(status 0) with a human message
// - Non-JSON body (e.g. an HTML 500 page) -> tolerated, generic message
// - !res.ok -> ApiError carrying the server's { error } message when present
// Pages catch ApiError and show err.message; err.status distinguishes
// cases when needed (e.g. 429 rate limits, 404s).

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchJson<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiError(
      "Network error — check your connection and try again",
      0
    );
  }

  let data: unknown = null;
  try {
    const text = await res.text();
    if (text) data = JSON.parse(text);
  } catch {
    // Body wasn't JSON (e.g. a framework HTML error page) — fall through
    // with data = null; the status decides what happens next.
  }

  if (!res.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}
