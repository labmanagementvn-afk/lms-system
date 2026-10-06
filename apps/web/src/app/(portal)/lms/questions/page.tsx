'use client';

import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeInvisibleOutlined, PlusOutlined, UndoOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, Input, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AnswerReview } from '@/components/assessments/AnswerReview';
import { ImportQuestionsModal } from '@/components/assessments/ImportQuestionsModal';
import { DIFFICULTY_COLOR } from '@/components/assessments/model';
import { BankQuestion, QuestionEditor } from '@/components/assessments/QuestionEditor';
import { downloadCsv } from '@/components/grades/download';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useSubjects } from '@/lib/hooks';
import { DIFFICULTY, options, QUESTION_TYPE } from '@/lib/labels';

const PAGE_SIZE = 20;

/** Ngân hàng câu hỏi: filter, preview, create / edit, CSV import and export. */
export default function QuestionBankPage() {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState<string>();
  const [gradeLevel, setGradeLevel] = useState<number>();
  const [type, setType] = useState<string>();
  const [difficulty, setDifficulty] = useState<number>();
  const [tag, setTag] = useState<string>();
  const [hidden, setHidden] = useState(false);
  const [editing, setEditing] = useState<BankQuestion | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const { data: subjects } = useSubjects();
  const { data: tags, mutate: mutateTags } = useSWR<string[]>(['/lms/questions/tags']);
  const filters = { q: q || undefined, subjectId, gradeLevel, type, difficulty, tag, isActive: hidden ? 'false' : undefined };
  const { data, isLoading, mutate } = useSWR<{ items: BankQuestion[]; total: number }>(['/lms/questions', { page, pageSize: PAGE_SIZE, ...filters }]);
  const defaults = useMemo(() => ({ subjectId, gradeLevel, difficulty, type: type as BankQuestion['type'] | undefined }), [subjectId, gradeLevel, difficulty, type]);

  const reset = () => setPage(1);
  const refresh = () => {
    mutate();
    mutateTags();
  };

  async function remove(item: BankQuestion) {
    try {
      const r = await api(`/lms/questions/${item.id}`, { method: 'DELETE' });
      message.success(r.deleted ? 'Đã xóa câu hỏi' : 'Câu hỏi đang dùng trong bài kiểm tra nên đã được ẩn');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function restore(item: BankQuestion) {
    try {
      await api(`/lms/questions/${item.id}`, { method: 'PATCH', body: { isActive: true } });
      message.success('Đã hiện lại câu hỏi');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Ngân hàng câu hỏi"
        extra={
          <Space wrap>
            <Button icon={<UploadOutlined />} onClick={() => setImporting(true)}>
              Nhập CSV
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => downloadCsv('/lms/questions/export', filters, 'ngan-hang-cau-hoi.csv').catch((e) => message.error(e.message))}>
              Xuất CSV
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
              Thêm câu hỏi
            </Button>
          </Space>
        }
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm trong nội dung" allowClear style={{ width: 220 }} onSearch={(v) => (setQ(v), reset())} />
        <Select placeholder="Môn học" allowClear style={{ width: 160 }} value={subjectId} onChange={(v) => (setSubjectId(v), reset())} options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <Select placeholder="Khối" allowClear style={{ width: 100 }} value={gradeLevel} onChange={(v) => (setGradeLevel(v), reset())} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Khối ${i + 1}` }))} />
        <Select placeholder="Loại câu hỏi" allowClear style={{ width: 170 }} value={type} onChange={(v) => (setType(v), reset())} options={options(QUESTION_TYPE)} />
        <Select placeholder="Mức độ" allowClear style={{ width: 150 }} value={difficulty} onChange={(v) => (setDifficulty(v), reset())} options={options(DIFFICULTY)} />
        <Select placeholder="Thẻ" allowClear showSearch style={{ width: 160 }} value={tag} onChange={(v) => (setTag(v), reset())} options={(tags ?? []).map((t) => ({ value: t, label: t }))} />
        <Checkbox checked={hidden} onChange={(e) => (setHidden(e.target.checked), reset())}>
          Câu hỏi đã ẩn
        </Checkbox>
      </Space>
      <Table<BankQuestion>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1000 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: data?.total, onChange: setPage, showSizeChanger: false, showTotal: (t) => `${t} câu hỏi` }}
        expandable={{
          expandedRowRender: (item) => (
            <div style={{ maxWidth: 760, padding: '4px 8px' }}>
              <AnswerReview question={item} correctAnswer={item.answer} mode="key" />
              {item.explanation && (
                <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                  <b>Giải thích:</b> {item.explanation}
                </Typography.Paragraph>
              )}
            </div>
          ),
        }}
        columns={[
          {
            title: 'Câu hỏi',
            render: (_, item) => (
              <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, cursor: 'pointer' }} onClick={() => setEditing(item)}>
                {item.content}
              </Typography.Paragraph>
            ),
          },
          { title: 'Loại', width: 150, render: (_, item) => QUESTION_TYPE[item.type] ?? item.type },
          { title: 'Mức độ', width: 130, render: (_, item) => <Tag color={DIFFICULTY_COLOR[item.difficulty]}>{DIFFICULTY[item.difficulty] ?? item.difficulty}</Tag> },
          { title: 'Môn', width: 120, render: (_, item) => item.subject?.name ?? '' },
          { title: 'Khối', width: 60, render: (_, item) => item.gradeLevel ?? '' },
          {
            title: 'Thẻ',
            width: 180,
            render: (_, item) => (
              <Space size={[0, 4]} wrap>
                {item.tags.map((t) => (
                  <Tag key={t} style={{ cursor: 'pointer' }} onClick={() => (setTag(t), reset())}>
                    {t}
                  </Tag>
                ))}
              </Space>
            ),
          },
          { title: 'Dùng trong', width: 100, align: 'right', render: (_, item) => (item.usedIn ? `${item.usedIn} bài` : '') },
          {
            title: '',
            width: 96,
            render: (_, item) => (
              <Space size={4}>
                <Tooltip title="Sửa">
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(item)} />
                </Tooltip>
                {item.isActive ? (
                  <Popconfirm
                    title={item.usedIn ? 'Câu hỏi đang được dùng nên sẽ được ẩn khỏi ngân hàng. Tiếp tục?' : 'Xóa câu hỏi này?'}
                    okText={item.usedIn ? 'Ẩn' : 'Xóa'}
                    cancelText="Hủy"
                    onConfirm={() => remove(item)}
                  >
                    <Tooltip title={item.usedIn ? 'Ẩn' : 'Xóa'}>
                      <Button size="small" danger icon={item.usedIn ? <EyeInvisibleOutlined /> : <DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                ) : (
                  <Tooltip title="Hiện lại">
                    <Button size="small" icon={<UndoOutlined />} onClick={() => restore(item)} />
                  </Tooltip>
                )}
              </Space>
            ),
          },
        ]}
      />
      <QuestionEditor open={editing !== undefined} initial={editing ?? null} defaults={defaults} onClose={() => setEditing(undefined)} onSaved={refresh} />
      <ImportQuestionsModal open={importing} onClose={() => setImporting(false)} onDone={refresh} />
    </>
  );
}
