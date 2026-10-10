'use client';

import { Button, Card, Col, Progress, Row, Select, Space, Statistic, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import useSWR from 'swr';
import { useAllTeachers } from '@/lib/hooks';
import { ReportButtons } from './ReportButtons';

interface MonitorRow {
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  students: number;
  expected: number;
  entered: number;
  percent: number;
}
interface Monitor {
  rows: MonitorRow[];
  totals: { expected: number; entered: number; percent: number };
}

const status = (p: number) => (p >= 100 ? 'success' : 'normal');

/** Giám sát nhập điểm: how many of the expected marks each teacher has entered, per class and subject. */
export function MonitorTab({ semester, gradeLevels, onShowMissing }: { semester: number; gradeLevels: number[]; onShowMissing: (classId: string) => void }) {
  const [gradeLevel, setGradeLevel] = useState<number>();
  const [teacherId, setTeacherId] = useState<string>();
  const { data: teachers } = useAllTeachers();
  const { data, isLoading } = useSWR<Monitor>(['/grades/monitor', { semester, gradeLevel, teacherId }]);
  const totals = data?.totals ?? { expected: 0, entered: 0, percent: 0 };
  const done = (data?.rows ?? []).filter((r) => r.percent >= 100).length;

  const columns: ColumnsType<MonitorRow> = [
    { title: 'Giáo viên', dataIndex: 'teacherName', width: 200 },
    { title: 'Lớp', dataIndex: 'className', width: 90 },
    { title: 'Môn học', dataIndex: 'subjectName', width: 180 },
    { title: 'Sĩ số', dataIndex: 'students', width: 70, align: 'right' },
    { title: 'Đã nhập / cần nhập', width: 150, align: 'right', render: (_, r) => `${r.entered} / ${r.expected}` },
    { title: 'Tiến độ', width: 200, render: (_, r) => <Progress percent={r.percent} size="small" status={status(r.percent)} /> },
    {
      title: '',
      width: 150,
      render: (_, r) =>
        r.percent < 100 && (
          <Button type="link" size="small" onClick={() => onShowMissing(r.classId)}>
            Học sinh thiếu điểm
          </Button>
        ),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Tiến độ toàn trường" value={totals.percent} suffix="%" precision={1} />
            <Progress percent={totals.percent} showInfo={false} status={status(totals.percent)} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Điểm đã nhập" value={totals.entered} suffix={`/ ${totals.expected}`} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Lớp - môn đã nhập đủ" value={done} suffix={`/ ${data?.rows.length ?? 0}`} />
          </Card>
        </Col>
      </Row>
      <Space wrap style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select allowClear placeholder="Mọi khối" value={gradeLevel} onChange={setGradeLevel} style={{ width: 140 }} options={gradeLevels.map((g) => ({ value: g, label: `Khối ${g}` }))} />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Mọi giáo viên"
            value={teacherId}
            onChange={setTeacherId}
            style={{ width: 240 }}
            options={(teachers?.items ?? []).map((t) => ({ value: t.id, label: t.fullName }))}
          />
        </Space>
        <ReportButtons report="entry-monitoring" query={{ semester, gradeLevel }} fileName={`giam-sat-nhap-diem-hk${semester}`} />
      </Space>
      <Table<MonitorRow>
        rowKey={(r) => `${r.teacherId}|${r.classId}|${r.subjectId}`}
        size="small"
        loading={isLoading}
        dataSource={data?.rows ?? []}
        columns={columns}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: 'Chưa có phân công giảng dạy trong thời khóa biểu học kỳ này' }}
        scroll={{ x: 'max-content' }}
      />
    </>
  );
}
