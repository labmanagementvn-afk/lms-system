'use client';

import { Alert, Form, Modal, Select } from 'antd';
import { useState } from 'react';
import { useClasses } from '@/lib/hooks';

/** Picks the class an accepted application (or several) is enrolled into. */
export function EnrolModal({ open, count, gradeLevel, onClose, onSubmit }: { open: boolean; count: number; gradeLevel?: number; onClose: () => void; onSubmit: (classId: string) => Promise<void> }) {
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const options = classes?.map((c) => ({ value: c.id, label: `${c.name} (khối ${c.gradeLevel}, ${c._count?.enrollments ?? 0} HS)` }));
  const chosen = classes?.find((c) => c.id === classId);

  async function ok() {
    if (!classId) return;
    setBusy(true);
    try {
      await onSubmit(classId);
      setClassId(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={count > 1 ? `Nhập học ${count} hồ sơ` : 'Nhập học'}
      open={open}
      onOk={ok}
      onCancel={onClose}
      okText="Nhập học"
      cancelText="Hủy"
      okButtonProps={{ disabled: !classId, loading: busy }}
      destroyOnHidden
    >
      <p>Tạo hồ sơ học sinh, phụ huynh và xếp vào lớp. Mã học sinh được cấp tự động.</p>
      <Form layout="vertical">
        <Form.Item label="Lớp" required>
          <Select showSearch optionFilterProp="label" placeholder="Chọn lớp" options={options} value={classId} onChange={setClassId} />
        </Form.Item>
      </Form>
      {chosen && gradeLevel && chosen.gradeLevel !== gradeLevel && <Alert type="warning" showIcon message={`Lớp ${chosen.name} thuộc khối ${chosen.gradeLevel}, đợt tuyển sinh dành cho khối ${gradeLevel}.`} />}
    </Modal>
  );
}
