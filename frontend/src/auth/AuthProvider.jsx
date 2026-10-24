import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, API_URL, clearToken, getToken, setToken } from '../api/client.js';
import { AuthContext } from './context.js';

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // The API client fires this when the server rejects the stored token.
  useEffect(() => {
    const onExpired = () => {
      setTokenState(null);
      setUser(null);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setChecking(false);
      return;
    }
    try {
      const data = await api('/api/auth/me');
      setUser(data.user || null);
    } catch {
      clearToken();
      setTokenState(null);
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const saveToken = useCallback((newToken) => {
    setToken(newToken);
    setTokenState(newToken);
    return loadUser();
  }, [loadUser]);

  const loginWithGitHub = useCallback(() => {
    window.location.href = `${API_URL}/api/auth/github/login`;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, checking, saveToken, loginWithGitHub, logout, refreshUser: loadUser }),
    [token, user, checking, saveToken, loginWithGitHub, logout, loadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
