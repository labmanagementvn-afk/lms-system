'use client';

import { Select, Typography } from 'antd';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import useSWR from 'swr';

export interface Child {
  id: string;
  code: string;
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  status: string;
  class: { id: string; name: string; gradeLevel: number } | null;
  today: {
    date: string;
    status: 'ON_TIME' | 'LATE' | 'ABSENT' | null;
    firstIn: string | null;
    lastOut: string | null;
    homeroom: { status: string; note: string | null } | null;
  };
}

interface ParentState {
  children: Child[];
  loading: boolean;
  /** The selected child; the first one until the parent picks another. */
  child: Child | null;
  setChildId: (id: string) => void;
  refresh: () => Promise<unknown>;
}

const ParentContext = createContext<ParentState | null>(null);
const KEY = 'lms.childId';

export function ParentProvider({ children: nodes }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useSWR<Child[]>(['/parent/children']);
  const [childId, setId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setId(localStorage.getItem(KEY));
    } catch {
      // storage unavailable; the first child stays selected
    }
  }, []);

  const kids = data ?? [];
  const child = kids.find((k) => k.id === childId) ?? kids[0] ?? null;
  const setChildId = (id: string) => {
    setId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // ignore
    }
  };

  return <ParentContext.Provider value={{ children: kids, loading: isLoading, child, setChildId, refresh: mutate }}>{nodes}</ParentContext.Provider>;
}

export function useParent() {
  const ctx = useContext(ParentContext);
  if (!ctx) throw new Error('useParent outside ParentProvider');
  return ctx;
}

/** Picks which child the parent app shows; plain text when there is only one. */
export function ChildSwitcher() {
  const { children, child, setChildId } = useParent();
  if (!child) return null;
  if (children.length === 1) {
    return (
      <Typography.Text style={{ color: '#fff' }} ellipsis>
        {child.fullName}
      </Typography.Text>
    );
  }
  return (
    <Select
      size="small"
      value={child.id}
      onChange={setChildId}
      options={children.map((c) => ({ value: c.id, label: c.class ? `${c.fullName} (${c.class.name})` : c.fullName }))}
      style={{ minWidth: 160 }}
      popupMatchSelectWidth={false}
    />
  );
}
