'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'STAFF' | 'TEACHER';
  teacherId: string | null;
  school: { id: string; name: string; timezone: string; lateAfter: string };
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<Me>('/auth/me')
      .then(setMe)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: { email, password } });
    setToken(res.accessToken);
    setMe(await api<Me>('/auth/me'));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    window.location.href = '/login';
  }, []);

  return <AuthContext.Provider value={{ me, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export const canManage = (me: Me | null) => me?.role === 'ADMIN';
export const canEditStudents = (me: Me | null) => me?.role === 'ADMIN' || me?.role === 'STAFF';
