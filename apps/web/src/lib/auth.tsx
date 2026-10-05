'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

export type RoleName = 'ADMIN' | 'STAFF' | 'TEACHER' | 'PARENT' | 'DRIVER' | 'STUDENT' | 'DISTRICT';

export interface Me {
  id: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  fullName: string;
  role: RoleName;
  mustChangePassword: boolean;
  teacherId: string | null;
  studentId: string | null;
  /** District officers have no school; AuthProvider fills in a placeholder so every page can read school.timezone. */
  school: { id: string; name: string; code: string; timezone: string; lateAfter: string };
  district: { id: string; code: string; name: string; level: 'PHONG' | 'SO'; province: string | null } | null;
}

/** Profile as the API returns it: school is null for district officers. */
type RawMe = Omit<Me, 'school'> & { school: Me['school'] | null };

const normalize = (m: RawMe): Me => ({
  ...m,
  district: m.district ?? null,
  school: m.school ?? { id: '', code: m.district?.code ?? '', name: m.district?.name ?? '', timezone: 'Asia/Ho_Chi_Minh', lateAfter: '07:15' },
});

interface AuthState {
  me: Me | null;
  loading: boolean;
  /** Signs in with an email (staff), a phone number (parents, drivers) or a student code. */
  login: (identifier: string, password: string) => Promise<Me>;
  /** Reloads the profile, e.g. after a password change. */
  refresh: () => Promise<Me>;
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
    api<RawMe>('/auth/me')
      .then((m) => setMe(normalize(m)))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const id = identifier.trim();
    const body = id.includes('@') ? { email: id, password } : /^[\d\s.+-]{9,}$/.test(id) ? { phone: id, password } : { username: id, password };
    const res = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body });
    setToken(res.accessToken);
    const profile = normalize(await api<RawMe>('/auth/me'));
    setMe(profile);
    return profile;
  }, []);

  const refresh = useCallback(async () => {
    const profile = normalize(await api<RawMe>('/auth/me'));
    setMe(profile);
    return profile;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    window.location.href = '/login';
  }, []);

  return <AuthContext.Provider value={{ me, loading, login, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Where each role lands after signing in: the parent, driver, student and district apps are separate from the school portal. */
export const homeFor = (role: RoleName) => (role === 'PARENT' ? '/parent' : role === 'DRIVER' ? '/driver' : role === 'STUDENT' ? '/student' : role === 'DISTRICT' ? '/district' : '/');
export const isPortalRole = (role: RoleName) => role === 'ADMIN' || role === 'STAFF' || role === 'TEACHER';

export const canManage = (me: Me | null) => me?.role === 'ADMIN';
export const canEditStudents = (me: Me | null) => me?.role === 'ADMIN' || me?.role === 'STAFF';
