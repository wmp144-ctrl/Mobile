export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

interface ErrorPayload {
  message?: string | string[];
  code?: string;
  details?: unknown;
}

function messageFrom(payload: ErrorPayload | null, fallback: string): string {
  if (!payload?.message) return fallback;
  if (Array.isArray(payload.message)) return payload.message.join('، ');
  return payload.message;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const api = {
  token: null as string | null,
  onUnauthorized: null as null | (() => Promise<boolean>),

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const includeAuth = options.auth !== false;
    const buildInit = (): RequestInit => ({
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(includeAuth && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    let response = await fetch(path, buildInit());
    if (response.status === 401 && includeAuth && this.onUnauthorized) {
      const refreshed = await this.onUnauthorized();
      if (refreshed) {
        response = await fetch(path, buildInit());
      }
    }

    if (response.status === 204) return undefined as T;

    const payload = (await parseJson(response)) as T & ErrorPayload;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.code ?? 'HTTP_ERROR',
        messageFrom(payload ?? null, 'خطایی در ارتباط با سرور رخ داد.'),
        payload?.details,
      );
    }
    return payload as T;
  },

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  },

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  },

  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  },

  delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  },

  /** بارگذاری فایل چندبخشی (FormData) با همان مدیریت نشست */
  async upload<T>(path: string, formData: FormData): Promise<T> {
    const buildInit = (): RequestInit => ({
      method: 'POST',
      credentials: 'include',
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: formData,
    });

    let response = await fetch(path, buildInit());
    if (response.status === 401 && this.onUnauthorized) {
      const refreshed = await this.onUnauthorized();
      if (refreshed) response = await fetch(path, buildInit());
    }

    const payload = (await parseJson(response)) as T & ErrorPayload;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.code ?? 'HTTP_ERROR',
        messageFrom(payload ?? null, 'بارگذاری فایل ناموفق بود.'),
        payload?.details,
      );
    }
    return payload as T;
  },

  /** دریافت فایل محافظت‌شده و تبدیل به آدرس قابل نمایش */
  async objectUrl(path: string): Promise<string> {
    const response = await fetch(path, {
      credentials: 'include',
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (!response.ok) {
      throw new ApiError(response.status, 'HTTP_ERROR', 'دریافت فایل ناموفق بود.');
    }
    return URL.createObjectURL(await response.blob());
  },
};

export async function downloadFile(path: string, fileName: string): Promise<void> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: api.token ? { Authorization: `Bearer ${api.token}` } : {},
  });
  if (!response.ok) {
    const payload = (await parseJson(response)) as ErrorPayload | null;
    throw new ApiError(
      response.status,
      payload?.code ?? 'HTTP_ERROR',
      messageFrom(payload, 'دریافت فایل ناموفق بود.'),
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
