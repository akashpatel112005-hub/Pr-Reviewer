export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const KEY = 'pr_reviewer_token';
let memoryToken = null;

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// localStorage can be blocked (private mode), so the token is also kept in memory.
export function getToken() {
  if (memoryToken) return memoryToken;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  memoryToken = token;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // keep the in-memory token only
  }
}

export function clearToken() {
  memoryToken = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new ApiError('The server took too long to respond. Please try again.');
    throw new ApiError('Cannot reach the server. Check that the backend is running.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // response had no JSON body
  }

  // A rejected token means the session is over: clear it and tell the app.
  if (res.status === 401 && token) {
    clearToken();
    window.dispatchEvent(new Event('auth:expired'));
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}