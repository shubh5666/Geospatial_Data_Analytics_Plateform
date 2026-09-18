const SESSION_KEY = 'darukaa.session';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || '/api';

export const session = {
  get: () => sessionStorage.getItem(SESSION_KEY),
  set: (token: string) => sessionStorage.setItem(SESSION_KEY, token),
  clear: () => sessionStorage.removeItem(SESSION_KEY),
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = session.get();
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const timeout = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options, headers,
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('Unable to reach the server. Check your connection and try again.', { cause: error });
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token && session.get() === token) {
      session.clear();
      window.dispatchEvent(new Event('session-expired'));
    }
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((issue: { loc?: string[]; msg: string }) => `${issue.loc?.slice(1).join('.') || 'Input'}: ${issue.msg}`).join('. ')
      : 'Something went wrong. Please try again.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function allPages<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await api<T[]>(`${path}?limit=1000&offset=${offset}`, { signal });
    items.push(...page);
    if (page.length < 1000) return items;
  }
}

export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
