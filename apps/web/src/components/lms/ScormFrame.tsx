'use client';

import { useEffect, useRef, useState } from 'react';
import { scormUrl } from '@/lib/api';

export type ScormData = Record<string, string>;

/** SCORM 1.2 runtime (the `window.API` object a package looks for in its parent frames). */
interface ScormApi {
  LMSInitialize(arg: string): string;
  LMSFinish(arg: string): string;
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): string;
  LMSCommit(arg: string): string;
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
  LMSGetDiagnostic(code: string): string;
}

declare global {
  interface Window {
    API?: ScormApi;
  }
}

const DEFAULTS: ScormData = {
  'cmi.core.lesson_status': 'not attempted',
  'cmi.core.lesson_mode': 'normal',
  'cmi.core.credit': 'credit',
  'cmi.core.entry': 'ab-initio',
  'cmi.core.lesson_location': '',
  'cmi.core.score.raw': '',
  'cmi.core.score.min': '',
  'cmi.core.score.max': '',
  'cmi.core.total_time': '0000:00:00',
  'cmi.suspend_data': '',
  'cmi.launch_data': '',
  'cmi.core._children': 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
  'cmi.core.score._children': 'raw,min,max',
};

export const scormCompleted = (data: ScormData) => ['completed', 'passed'].includes(data['cmi.core.lesson_status']);

/**
 * Plays an unpacked SCORM 1.2 package. A minimal runtime is installed on
 * `window.API` before the iframe loads; every LMSCommit / LMSFinish hands the
 * cmi.* map to `onCommit` so the caller can persist it as lesson progress.
 */
export function ScormFrame({
  file,
  student,
  initialData,
  onCommit,
}: {
  file: { id: string; launchPath: string };
  student: { code: string; fullName: string };
  initialData?: ScormData | null;
  onCommit: (data: ScormData, completed: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const data: ScormData = { ...DEFAULTS, ...(initialData ?? {}), 'cmi.core.student_id': student.code, 'cmi.core.student_name': student.fullName };
    if (initialData && Object.keys(initialData).length) data['cmi.core.entry'] = 'resume';
    let dirty = false;
    const commit = () => {
      commitRef.current({ ...data }, scormCompleted(data));
      dirty = false;
    };
    const api: ScormApi = {
      LMSInitialize: () => 'true',
      LMSFinish: () => {
        commit();
        return 'true';
      },
      LMSGetValue: (key) => data[key] ?? '',
      LMSSetValue: (key, value) => {
        data[key] = String(value);
        dirty = true;
        return 'true';
      },
      LMSCommit: () => {
        commit();
        return 'true';
      },
      LMSGetLastError: () => '0',
      LMSGetErrorString: () => 'No error',
      LMSGetDiagnostic: () => '',
    };
    window.API = api;
    setReady(true);
    return () => {
      // Leaving the page without LMSFinish: keep whatever the package set.
      if (dirty) commit();
      if (window.API === api) delete window.API;
      setReady(false);
    };
    // The runtime is installed once per lesson open; later prop changes do not restart the package.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  if (!ready) return null;
  return <iframe src={scormUrl(file.id, file.launchPath)} title="SCORM" style={{ width: '100%', height: '70vh', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }} allow="autoplay; fullscreen" />;
}
