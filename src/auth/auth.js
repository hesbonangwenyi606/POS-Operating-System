import { api } from '../api/client.js';

const TOKEN_KEY = 'od_auth_token';
const OFFLINE_KEY = 'od_offline_user';

export function createAuth() {
  async function login(username, password) {
    const result = await api.login({ username, password });
    localStorage.setItem(TOKEN_KEY, result.token);
    return result.user;
  }

  async function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OFFLINE_KEY);
    return true;
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY); }

  async function validateToken(token) {
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function isAuthenticated() { return !!getToken(); }

  function setOfflineUser(user) { localStorage.setItem(OFFLINE_KEY, JSON.stringify(user)); }
  function getOfflineUser() { try { return JSON.parse(localStorage.getItem(OFFLINE_KEY)); } catch { return null; } }

  return { login, logout, getToken, validateToken, isAuthenticated, setOfflineUser, getOfflineUser };
}

export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.permissions?.includes('*')) return true;
  return user.permissions?.includes(permission) || false;
}