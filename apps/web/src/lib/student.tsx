'use client';

import useSWR from 'swr';

export interface StudentMe {
  id: string;
  code: string;
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  status: string;
  class: { id: string; name: string; gradeLevel: number; homeroomTeacher: { id: string; fullName: string } | null } | null;
  academicYear: { id: string; name: string; isCurrent: boolean } | null;
}

/** The signed-in student's profile and current class (GET /student/me). */
export function useStudent() {
  const { data, isLoading, mutate } = useSWR<StudentMe>(['/student/me']);
  return { student: data ?? null, loading: isLoading, refresh: mutate };
}
