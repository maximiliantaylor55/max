export type AppUser = {
  id: string;
  name: string;
  username?: string;
  role: string;
  permissions?: string[];
};

export type DataKey =
  | 'zyro-products'
  | 'zyro-stock-movements'
  | 'zyro-sales-documents'
  | 'zyro-customers'
  | 'zyro-sales-target';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const apiBase = 'https://europe-west3-zyro-78855.cloudfunctions.net';

const request = async <T>(path: string, options: RequestInit = {}, token?: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `ZYRO-Cloud nicht erreichbar: ${error.message}` : 'ZYRO-Cloud nicht erreichbar.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error || `Cloud-Anfrage fehlgeschlagen (${response.status}).`, response.status);
  }
  return payload as T;
};

export const apiLogin = (username: string, password: string) =>
  request<{ sessionToken: string; user: AppUser }>('webAppLogin', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const apiLogout = (token: string) =>
  request<{ success: boolean }>('webAppAuth', {
    method: 'POST',
    body: JSON.stringify({ action: 'logout' }),
  }, token);

export const apiGet = (token: string, key: DataKey) =>
  request<{ revision: number; value: any[] }>('webAppData', {
    method: 'POST',
    body: JSON.stringify({ action: 'get', key }),
  }, token);

export const apiMde = (token: string, body: Record<string, unknown>) =>
  request<Record<string, any>>('webAppMde', {
    method: 'POST',
    body: JSON.stringify(body),
  }, token);
