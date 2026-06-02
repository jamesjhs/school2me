const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
let csrfToken: string | null = null;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error ?? 'Request failed', response.status);
  }

  return payload as T;
};

export const apiGet = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'include'
  });
  return handleResponse<T>(response);
};

const ensureCsrfToken = async (): Promise<string> => {
  if (csrfToken) {
    return csrfToken;
  }

  const response = await fetch(`${API_BASE}/api/auth/csrf`, {
    method: 'GET',
    credentials: 'include'
  });
  const payload = (await response.json()) as { csrfToken?: string };
  csrfToken = payload.csrfToken ?? '';
  return csrfToken;
};

export const apiPost = async <T>(path: string, body: unknown): Promise<T> => {
  const token = await ensureCsrfToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': token
    },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  return handleResponse<T>(response);
};

export const apiPut = async <T>(path: string, body: unknown): Promise<T> => {
  const token = await ensureCsrfToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': token
    },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  return handleResponse<T>(response);
};
