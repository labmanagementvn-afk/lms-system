'use client';

import { Alert, Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import { dmy, GENDER, POLICY_GROUP, RELATIONSHIP, RESULT_LEVEL } from '@/lib/labels';
import { Book, BookStudent } from './types';

const LEVELS = ['TOT', 'KHA', 'DAT', 'CHUA_DAT'];

/** Thông tin chung: the class's situation, its subject teachers, and its students with their families. */
export function BookGeneral({ book }: { book: Book }) {
  const s = book.situation;
  const p = s.previous;
  const secondary = book.class.gradeLevel >= 10;
  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="Sĩ số" value={s.total} suffix={<Typography.Text type="secondary" style={{ fontSize: 13 }}>({s.female} nữ)</Typography.Text>} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="Dân tộc thiểu số" value={s.ethnicMinority} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="Theo tôn giáo" value={s.religion} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title={secondary ? 'Đoàn viên' : 'Đội viên'} value={secondary ? s.youthUnion : s.youngPioneer} />
          </Card>
        </Col>
        <Col xs={24} md={16} lg={8}>
          <Card size="small">
            <Statistic
              title="Học sinh thuộc diện chính sách"
              value={s.policy.reduce((a, x) => a + x.count, 0)}
              suffix={
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {s.policy.map((x) => `${POLICY_GROUP[x.group]} ${x.count}`).join(', ')}
                </Typography.Text>
              }
            />
          </Card>
        </Col>
      </Row>
      {p && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={`Kết quả năm học ${p.academicYear.name} của ${p.students} học sinh trong lớp`}
          description={`Học tập: ${LEVELS.map((l) => `${RESULT_LEVEL[l].label} ${p.academic[l] ?? 0}`).join(', ')}. Rèn luyện: ${LEVELS.map((l) => `${RESULT_LEVEL[l].label} ${p.conduct[l] ?? 0}`).join(', ')}. ${p.excellent} học sinh Xuất sắc, ${p.good} học sinh Giỏi.`}
        />
      )}
      <Card size="small" title="Giáo viên bộ môn" style={{ marginBottom: 12 }}>
        <Table
          rowKey={(r) => r.subject.id}
          size="small"
          pagination={false}
          dataSource={book.subjectTeachers}
          locale={{ emptyText: 'Chưa có phân công giảng dạy hay thời khóa biểu' }}
          columns={[
            { title: 'Môn học', render: (_, r) => r.subject.name },
            { title: 'Học kỳ I', render: (_, r) => r.semester1.join(', ') },
            { title: 'Học kỳ II', render: (_, r) => r.semester2.join(', ') || <Typography.Text type="secondary">Chưa phân công</Typography.Text> },
          ]}
        />
      </Card>
      <Card size="small" title="Học sinh và gia đình">
        <Table<BookStudent>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={book.students}
          scroll={{ x: 1100 }}
          columns={[
            { title: 'STT', width: 50, align: 'center', render: (_, __, i) => i + 1 },
            {
              title: 'Họ và tên',
              width: 190,
              render: (_, st) => (
                <>
                  {st.fullName}
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    {st.code}
                  </Typography.Text>
                </>
              ),
            },
            { title: 'Ngày sinh', width: 100, render: (_, st) => dmy(st.dateOfBirth) },
            { title: 'Giới tính', width: 80, render: (_, st) => (st.gender ? GENDER[st.gender] : '') },
            { title: 'Dân tộc', width: 80, dataIndex: 'ethnicity' },
            {
              title: 'Diện chính sách',
              width: 150,
              render: (_, st) =>
                st.policyGroups.map((g) => (
                  <Tag key={g} color="gold">
                    {POLICY_GROUP[g]}
                  </Tag>
                )),
            },
            {
              title: 'Cha mẹ, người giám hộ',
              render: (_, st) =>
                st.guardians.map((g) => (
                  <div key={g.id}>
                    {RELATIONSHIP[g.relationship]}: {g.fullName}
                    {g.occupation ? `, ${g.occupation}` : ''} · <a href={`tel:${g.phone}`}>{g.phone}</a>
                  </div>
                )),
            },
            { title: 'Chỗ ở hiện nay', width: 240, dataIndex: 'residence' },
          ]}
        />
      </Card>
    </>
  );
}

/** Kết quả học tập, rèn luyện và chuyên cần of each student. */
export function BookResults({ book }: { book: Book }) {
  const level = (l: string | null | undefined) => (l ? <Tag color={RESULT_LEVEL[l]?.color}>{RESULT_LEVEL[l]?.label}</Tag> : '');
  const term = (key: 'semester1' | 'semester2' | 'year', title: string) => ({
    title,
    children: [
      { title: 'Học tập', width: 90, align: 'center' as const, render: (_: unknown, st: BookStudent) => level(st.results[key]?.academic) },
      { title: 'Rèn luyện', width: 90, align: 'center' as const, render: (_: unknown, st: BookStudent) => level(st.results[key]?.conduct) },
    ],
  });
  return (
    <Table<BookStudent>
      rowKey="id"
      size="small"
      bordered
      pagination={false}
      dataSource={book.students}
      scroll={{ x: 1250 }}
      columns={[
        { title: 'STT', width: 50, align: 'center', render: (_, __, i) => i + 1 },
        { title: 'Họ và tên', width: 190, dataIndex: 'fullName' },
        term('semester1', 'Học kỳ I'),
        term('semester2', 'Học kỳ II'),
        {
          ...term('year', 'Cả năm'),
          children: [...term('year', 'Cả năm').children, { title: 'Danh hiệu', width: 140, render: (_: unknown, st: BookStudent) => st.results.year?.title ?? '' }],
        },
        {
          title: 'Chuyên cần',
          children: [
            { title: 'Nghỉ có phép', width: 80, align: 'center' as const, render: (_: unknown, st: BookStudent) => st.absences.excused || '' },
            { title: 'Nghỉ không phép', width: 80, align: 'center' as const, render: (_: unknown, st: BookStudent) => (st.absences.unexcused ? <Typography.Text type="danger">{st.absences.unexcused}</Typography.Text> : '') },
            { title: 'Đi muộn', width: 70, align: 'center' as const, render: (_: unknown, st: BookStudent) => st.absences.late || '' },
          ],
        },
        { title: 'Khen thưởng', width: 80, align: 'center', render: (_, st) => st.awards || '' },
        { title: 'Kỷ luật', width: 70, align: 'center', render: (_, st) => st.disciplines || '' },
      ]}
    />
  );
}
