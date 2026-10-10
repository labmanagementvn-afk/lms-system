'use client';

import { Segmented, Tabs } from 'antd';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ColumnLocksTab } from '@/components/grades/control/ColumnLocksTab';
import { EditLogTab } from '@/components/grades/control/EditLogTab';
import { EntryWindowsTab } from '@/components/grades/control/EntryWindowsTab';
import { ExemptionsTab } from '@/components/grades/control/ExemptionsTab';
import { MissingTab } from '@/components/grades/control/MissingTab';
import { MonitorTab } from '@/components/grades/control/MonitorTab';
import { VisibilityTab } from '@/components/grades/control/VisibilityTab';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';

/**
 * Quản lý sổ điểm: column locks, the entry window, entry monitoring, the edit
 * log, exemptions and what families see. Teachers get the read-only parts and
 * their missing-marks list; the office manages the rest.
 */
export default function GradebookControlPage() {
  const { me } = useAuth();
  const admin = me?.role === 'ADMIN';
  const office = admin || me?.role === 'STAFF';
  const { data: classes } = useClasses();
  const gradeLevels = useMemo(() => [...new Set((classes ?? []).map((c) => c.gradeLevel as number))].sort((a, b) => a - b), [classes]);
  const [semester, setSemester] = useState(1);
  const [tab, setTab] = useState(office ? 'monitor' : 'missing');
  const [missingClass, setMissingClass] = useState<string>();

  const showMissing = (classId: string) => {
    setMissingClass(classId);
    setTab('missing');
  };

  const semesterTabs = ['locks', 'monitor', 'missing', 'edits'];
  const items = [
    ...(office ? [{ key: 'monitor', label: 'Giám sát nhập điểm', children: <MonitorTab semester={semester} gradeLevels={gradeLevels} onShowMissing={showMissing} /> }] : []),
    { key: 'missing', label: 'Học sinh thiếu điểm', children: <MissingTab semester={semester} classId={missingClass} onClassChange={setMissingClass} /> },
    { key: 'locks', label: 'Khóa cột điểm', children: <ColumnLocksTab semester={semester} canEdit={admin} gradeLevels={gradeLevels} /> },
    { key: 'window', label: 'Thời gian nhập điểm', children: <EntryWindowsTab canEdit={admin} /> },
    ...(office ? [{ key: 'edits', label: 'Thống kê sửa điểm', children: <EditLogTab semester={semester} /> }] : []),
    { key: 'exemptions', label: 'Miễn học', children: <ExemptionsTab canEdit={office} /> },
    ...(office ? [{ key: 'visibility', label: 'Hiển thị cho phụ huynh', children: <VisibilityTab canEdit={admin} /> }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Quản lý sổ điểm"
        extra={
          semesterTabs.includes(tab) && (
            <Segmented
              value={semester}
              onChange={(v) => setSemester(Number(v))}
              options={[
                { value: 1, label: 'Học kỳ 1' },
                { value: 2, label: 'Học kỳ 2' },
              ]}
            />
          )
        }
      />
      <Tabs activeKey={tab} onChange={setTab} items={items} destroyOnHidden />
    </>
  );
}
