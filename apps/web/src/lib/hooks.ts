'use client';

import useSWR from 'swr';

export interface Option {
  id: string;
  name?: string;
  fullName?: string;
  code?: string;
}

export const useSubjects = () => useSWR<any[]>(['/subjects']);
export const useClasses = (academicYearId?: string) => useSWR<any[]>(['/classes', { academicYearId }]);
export const useAllTeachers = () => useSWR<{ items: any[] }>(['/teachers', { pageSize: 200, status: 'ACTIVE' }]);
export const usePeriods = () => useSWR<any[]>(['/periods']);
export const useAcademicYears = () => useSWR<any[]>(['/academic-years']);
