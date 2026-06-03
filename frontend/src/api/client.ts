const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
let csrfToken: string | null = null;

export class ApiError extends Error {
  status: number;
  requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }
}

const describeRuntimeContext = (url: string) => {
  const locationOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const online = typeof navigator !== 'undefined' ? String(navigator.onLine) : 'unknown';

  return {
    url,
    apiBase: API_BASE || '(same-origin)',
    pageOrigin: locationOrigin,
    browserOnline: online
  };
};

const buildNetworkError = (method: string, url: string, error: unknown) => {
  const context = describeRuntimeContext(url);
  const cause = error instanceof Error ? error.message : String(error);

  console.error('API network request failed', {
    method,
    ...context,
    cause
  });

  return new ApiError(
    [
      `Network request failed during ${method} ${url}.`,
      `The browser could not complete the request to the backend.`,
      `Cause: ${cause}.`,
      `Context: page origin=${context.pageOrigin}, api base=${context.apiBase}, browser online=${context.browserOnline}.`,
      'Check browser devtools for CORS/preflight, mixed-content, DNS/TLS, or reverse-proxy failures.'
    ].join('\n'),
    0
  );
};

const request = async (method: string, path: string, body?: unknown): Promise<Response> => {
  const url = `${API_BASE}${path}`;

  try {
    return await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw buildNetworkError(method, url, error);
  }
};

const handleResponse = async <T>(response: Response, method: string, url: string): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  const requestId = response.headers.get('x-request-id') ?? undefined;
  if (!response.ok) {
    console.error('API response returned an error', {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      requestId,
      payload
    });

    throw new ApiError(
      [
        payload.error ?? `Request failed with status ${response.status}.`,
        `HTTP: ${response.status} ${response.statusText}`,
        `URL: ${url}`,
        requestId ? `Request ID: ${requestId}` : null
      ]
        .filter(Boolean)
        .join('\n'),
      response.status,
      requestId
    );
  }

  return payload as T;
};

export const apiGet = async <T>(path: string): Promise<T> => {
  const response = await request('GET', path);
  return handleResponse<T>(response, 'GET', `${API_BASE}${path}`);
};

const ensureCsrfToken = async (): Promise<string> => {
  if (csrfToken) {
    return csrfToken;
  }

  const path = '/api/auth/csrf';
  const url = `${API_BASE}${path}`;
  const response = await request('GET', path);
  const payload = await handleResponse<{ csrfToken?: string }>(response, 'GET', url);
  csrfToken = payload.csrfToken ?? '';

  if (!csrfToken) {
    console.error('CSRF bootstrap succeeded without a csrfToken field', {
      url,
      requestId: response.headers.get('x-request-id') ?? undefined
    });

    throw new ApiError(
      [
        'CSRF bootstrap response did not contain a token.',
        `URL: ${url}`,
        `Request ID: ${response.headers.get('x-request-id') ?? 'not provided'}`
      ].join('\n'),
      500,
      response.headers.get('x-request-id') ?? undefined
    );
  }

  return csrfToken;
};

export const apiPost = async <T>(path: string, body: unknown): Promise<T> => {
  const token = await ensureCsrfToken();
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': token
      },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return handleResponse<T>(response, 'POST', url);
  } catch (error) {
    throw buildNetworkError('POST', url, error);
  }
};

export const apiPut = async <T>(path: string, body: unknown): Promise<T> => {
  const token = await ensureCsrfToken();
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': token
      },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    return handleResponse<T>(response, 'PUT', url);
  } catch (error) {
    throw buildNetworkError('PUT', url, error);
  }
};

export const apiDelete = async <T>(path: string): Promise<T> => {
  const token = await ensureCsrfToken();
  const url = `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'x-csrf-token': token
      },
      credentials: 'include'
    });
    return handleResponse<T>(response, 'DELETE', url);
  } catch (error) {
    throw buildNetworkError('DELETE', url, error);
  }
};
