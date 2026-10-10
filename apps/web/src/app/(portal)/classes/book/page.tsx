'use client';

import { FilePdfOutlined } from '@ant-design/icons';
import { Alert, App, Button, Empty, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { downloadFile } from '@/components/grades/download';
import { BookGeneral, BookResults } from '@/components/homeroom-book/BookGeneral';
import { BookMeetings } from '@/components/homeroom-book/BookMeetings';
import { BookNotes } from '@/components/homeroom-book/BookNotes';
import { BookOfficers } from '@/components/homeroom-book/BookOfficers';
import { BookPlans } from '@/components/homeroom-book/BookPlans';
import { BookReviews } from '@/components/homeroom-book/BookReviews';
import { BookSeating } from '@/components/homeroom-book/BookSeating';
import { Book, SaveBook } from '@/components/homeroom-book/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { byClassName } from '@/lib/teaching';

/**
 * Sổ chủ nhiệm: the homeroom teacher's book of the class. The general part is read from
 * the student records, the timetable and the gradebook; the teacher writes the rest, and
 * the school's leaders read it and record their review.
 */
export default function HomeroomBookPage() {
  const { me } = useAuth();
  const { message } = App.useApp();
  const isTeacher = me?.role === 'TEACHER';
  const { data: classes } = useClasses();
  const mine = useMemo(() => [...(classes ?? [])].filter((c) => !isTeacher || c.homeroomTeacherId === me?.teacherId).sort(byClassName), [classes, isTeacher, me?.teacherId]);
  const [classId, setClassId] = useState<string>();
  const [tab, setTab] = useState('general');
  const [printing, setPrinting] = useState(false);
  const { data: book, error, isLoading, mutate } = useSWR<Book>(classId ? ['/homeroom/book', { classId }] : null);

  useEffect(() => {
    if (!classId && mine.length) setClassId(mine[0].id);
  }, [classId, mine]);

  const save: SaveBook = async (part, done = 'Đã lưu') => {
    try {
      const next = await api<Book>('/homeroom/book', { method: 'PUT', body: { classId, ...part } });
      mutate(next, { revalidate: false });
      message.success(done);
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    }
  };
  const refresh = () => void mutate();

  async function print() {
    if (!book) return;
    setPrinting(true);
    try {
      await downloadFile('/reports/homeroom-book', { classId: book.class.id, format: 'pdf' }, `so-chu-nhiem-${book.class.name}.pdf`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sổ chủ nhiệm"
        extra={
          <Space wrap>
            <Select
              style={{ width: 260 }}
              placeholder="Chọn lớp"
              value={classId}
              onChange={setClassId}
              showSearch
              optionFilterProp="label"
              options={mine.map((c) => ({ value: c.id, label: `Lớp ${c.name}${c.homeroomTeacher ? ` · GVCN ${c.homeroomTeacher.fullName}` : ''}` }))}
            />
            <Button icon={<FilePdfOutlined />} onClick={print} loading={printing} disabled={!book}>
              In sổ
            </Button>
          </Space>
        }
      />
      {classes && !mine.length && <Empty description={isTeacher ? 'Bạn chưa được phân công chủ nhiệm lớp nào trong năm học này' : 'Chưa có lớp'} />}
      {error && <Alert type="error" showIcon message={(error as Error).message} style={{ marginBottom: 12 }} />}
      {isLoading && <Spin style={{ display: 'block', margin: 48 }} />}
      {book && (
        <>
          <Typography.Paragraph>
            <b>Lớp {book.class.name}</b> · Năm học {book.class.academicYear.name} · Giáo viên chủ nhiệm: <b>{book.class.homeroomTeacher?.fullName ?? 'chưa phân công'}</b>
            {book.class.homeroomTeacher?.phone ? ` (${book.class.homeroomTeacher.phone})` : ''}
            {book.class.room ? ` · Phòng ${book.class.room}` : ''} · Sĩ số {book.situation.total}
            {!book.editable && <Tag style={{ marginLeft: 8 }}>Chỉ xem</Tag>}
            {book.updatedAt && (
              <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                Cập nhật {new Date(book.updatedAt).toLocaleString('vi-VN', { timeZone: me?.school.timezone })}
                {book.updatedBy ? ` bởi ${book.updatedBy}` : ''}
              </Typography.Text>
            )}
          </Typography.Paragraph>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: 'general', label: 'Thông tin chung', children: <BookGeneral book={book} /> },
              { key: 'officers', label: 'Cán sự lớp, ban đại diện', children: <BookOfficers book={book} save={save} /> },
              { key: 'seating', label: 'Tổ và chỗ ngồi', children: <BookSeating book={book} save={save} /> },
              { key: 'plans', label: 'Kế hoạch chủ nhiệm', children: <BookPlans book={book} save={save} refresh={refresh} /> },
              { key: 'notes', label: `Theo dõi học sinh (${book.notes.length})`, children: <BookNotes book={book} refresh={refresh} /> },
              { key: 'meetings', label: `Họp cha mẹ học sinh (${book.meetings.length})`, children: <BookMeetings book={book} refresh={refresh} /> },
              { key: 'results', label: 'Kết quả, chuyên cần', children: <BookResults book={book} /> },
              { key: 'reviews', label: `Ý kiến của Ban giám hiệu (${book.reviews.length})`, children: <BookReviews book={book} refresh={refresh} /> },
            ]}
          />
        </>
      )}
    </>
  );
}
