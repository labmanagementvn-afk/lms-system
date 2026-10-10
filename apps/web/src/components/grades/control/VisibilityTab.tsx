'use client';

import { SaveOutlined } from '@ant-design/icons';
import { App, Button, Card, List, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';

type Key = 'regularMarks' | 'examMarks' | 'averages' | 'termResults' | 'titles' | 'absences' | 'homeroomComment' | 'teacherNotes' | 'onlyAfterLock';
type Visibility = Record<Key, boolean>;

interface Item {
  key: Key;
  title: string;
  detail: string;
}

const PUBLISH: Item = {
  key: 'onlyAfterLock',
  title: 'Chỉ hiện điểm khi sổ điểm của lớp đã khóa',
  detail: 'Phụ huynh, học sinh chưa thấy điểm học kỳ đến khi nhà trường khóa sổ điểm của lớp (Kết quả học tập → Khóa sổ điểm). Cả năm hiện khi cả hai học kỳ đã khóa.',
};

const SHOWN: Item[] = [
  { key: 'regularMarks', title: 'Điểm đánh giá thường xuyên', detail: 'Các cột TX1, TX2…' },
  { key: 'examMarks', title: 'Điểm giữa kỳ và cuối kỳ', detail: 'Cột GK và CK' },
  { key: 'averages', title: 'Điểm trung bình môn', detail: 'ĐTBmhk, ĐTBmcn và Đạt / Chưa đạt của môn nhận xét' },
  { key: 'termResults', title: 'Kết quả học tập, rèn luyện', detail: 'Mức Tốt / Khá / Đạt / Chưa đạt và kết quả lên lớp' },
  { key: 'titles', title: 'Danh hiệu', detail: 'Học sinh Xuất sắc, Học sinh Giỏi' },
  { key: 'absences', title: 'Số buổi nghỉ học', detail: 'Trong kết quả học kỳ, cả năm' },
  { key: 'homeroomComment', title: 'Nhận xét của giáo viên chủ nhiệm', detail: 'Trong kết quả học kỳ, cả năm' },
  { key: 'teacherNotes', title: 'Nhận xét của giáo viên bộ môn', detail: 'Ghi chú ở từng môn' },
];

/** Hiển thị cho phụ huynh, học sinh: which parts of the gradebook the family apps show, and when. */
export function VisibilityTab({ canEdit }: { canEdit: boolean }) {
  const { message } = App.useApp();
  const { data, mutate } = useSWR<Visibility>(['/grades/visibility']);
  const [draft, setDraft] = useState<Visibility>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const dirty = !!data && !!draft && (Object.keys(data) as Key[]).some((k) => data[k] !== draft[k]);
  const toggle = (key: Key, value: boolean) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const row = (item: Item) => (
    <List.Item actions={[<Switch key="s" checked={draft?.[item.key]} disabled={!canEdit || !draft} onChange={(v) => toggle(item.key, v)} />]}>
      <List.Item.Meta title={item.title} description={item.detail} />
    </List.Item>
  );

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await mutate(await api<Visibility>('/grades/visibility', { method: 'PUT', body: draft }), false);
      message.success('Đã lưu cấu hình hiển thị');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Typography.Paragraph type="secondary">Chọn những gì ứng dụng phụ huynh và học sinh được xem. Giáo viên và nhà trường luôn xem đầy đủ.</Typography.Paragraph>
      <Card size="small" title="Công bố điểm" style={{ marginBottom: 16 }}>
        <List dataSource={[PUBLISH]} renderItem={row} />
      </Card>
      <Card size="small" title="Phụ huynh, học sinh được xem">
        <List dataSource={SHOWN} renderItem={row} />
      </Card>
      {canEdit && (
        <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={saving} onClick={save} style={{ marginTop: 16 }}>
          Lưu
        </Button>
      )}
    </div>
  );
}
