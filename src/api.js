// Small wrapper around fetch for the RushHourParkingSystem API. The login cookie is httpOnly,
// so the browser sends it automatically and JavaScript never sees it.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Is the API running?", 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const fallback = res.status >= 500 ? "Can't reach the server. Is the API running?" : `Request failed (${res.status}).`;
    throw new ApiError(data?.error || fallback, res.status);
  }
  return data;
}
