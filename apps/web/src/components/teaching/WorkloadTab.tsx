'use client';

import { DownloadOutlined, FilePdfOutlined, WarningOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Row, Segmented, Select, Space, Statistic, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { downloadFile } from '@/components/grades/download';
import { DUTY_KIND, periods } from '@/lib/labels';
import { signed, Workload, WorkloadRow } from '@/lib/teaching';

/** Định mức tiết dạy: each teacher's norm, reductions, assigned periods and the difference, with the circular's limits. */
export function WorkloadTab() {
  const { message } = App.useApp();
  const [semester, setSemester] = useState(1);
  const [group, setGroup] = useState<string>();
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useSWR<Workload>(['/teaching/workload', { semester }]);

  const groups = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.teacher.subjectGroup).filter(Boolean) as string[])], [data]);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => (!group || r.teacher.subjectGroup === group) && (!warningsOnly || r.warnings.length)), [data, group, warningsOnly]);

  async function print(format: 'pdf' | 'xlsx') {
    setBusy(format);
    try {
      await downloadFile('/reports/teaching-assignments', { semester, format }, `phan-cong-chuyen-mon-hk${semester}.${format}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const t = data?.totals;
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented
          value={semester}
          onChange={(v) => setSemester(v as number)}
          options={[
            { value: 1, label: 'Học kỳ I' },
            { value: 2, label: 'Học kỳ II' },
          ]}
        />
        <Select allowClear placeholder="Tất cả các tổ" style={{ width: 260 }} value={group} onChange={setGroup} options={groups.map((g) => ({ value: g, label: g }))} />
        <Space>
          <Switch checked={warningsOnly} onChange={setWarningsOnly} size="small" />
          <span>Chỉ người có cảnh báo</span>
        </Space>
        <Button icon={<FilePdfOutlined />} onClick={() => print('pdf')} loading={busy === 'pdf'}>
          In bảng phân công chuyên môn
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => print('xlsx')} loading={busy === 'xlsx'}>
          Excel
        </Button>
      </Space>
      {data && (
        <Typography.Paragraph type="secondary">
          {data.setting.levelName}, năm học {data.academicYear.name}: định mức giáo viên {periods(data.setting.teacherNorm)} tiết/tuần, giáo viên chủ nhiệm được giảm {periods(data.setting.homeroomReduction)} tiết/tuần
          {data.setting.custom ? ' (định mức riêng của trường)' : ' (Thông tư 05/2025/TT-BGDĐT)'}. Chức vụ và kiêm nhiệm tính theo danh mục của trường.
        </Typography.Paragraph>
      )}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Cán bộ, giáo viên" value={t?.teachers ?? '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Tiết/tuần đã phân công" value={t ? periods(t.assigned) : '-'} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Dạy vượt định mức" value={t?.over ?? '-'} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Thiếu tiết" value={t?.short ?? '-'} valueStyle={{ color: '#d97706' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Card size="small">
            <Statistic title="Có cảnh báo" value={t?.warnings ?? '-'} valueStyle={t?.warnings ? { color: '#dc2626' } : undefined} prefix={t?.warnings ? <WarningOutlined /> : undefined} />
          </Card>
        </Col>
      </Row>
      <Table<WorkloadRow>
        rowKey={(r) => r.teacher.id}
        size="small"
        loading={isLoading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1180 }}
        columns={[
          {
            title: 'Giáo viên',
            width: 190,
            fixed: 'left',
            render: (_, r) => (
              <>
                <div>{r.teacher.fullName}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.teacher.code}
                  {r.teacher.subjectGroup ? ` · ${r.teacher.subjectGroup}` : ''}
                </Typography.Text>
              </>
            ),
          },
          {
            title: 'Chức vụ, kiêm nhiệm',
            width: 210,
            render: (_, r) => (
              <Space size={[4, 4]} wrap>
                {r.duties.map((d) => (
                  <Tooltip key={d.id} title={`${DUTY_KIND[d.dutyType.kind]?.label}: ${periods(d.effectivePeriods)} tiết${d.semester ? ` · chỉ học kỳ ${d.semester === 1 ? 'I' : 'II'}` : ''}${d.note ? ` · ${d.note}` : ''}`}>
                    <Tag color={DUTY_KIND[d.dutyType.kind]?.color}>{d.dutyType.name}</Tag>
                  </Tooltip>
                ))}
                {r.homeroomClasses.map((c) => (
                  <Tag key={c} color="cyan">
                    Chủ nhiệm {c}
                  </Tag>
                ))}
              </Space>
            ),
          },
          {
            title: 'Phân công giảng dạy',
            render: (_, r) =>
              r.teaching.length ? (
                r.teaching.map((x) => (
                  <div key={x.subject}>
                    {x.subject}: {x.classes.join(', ')} <Typography.Text type="secondary">({periods(x.periods)})</Typography.Text>
                  </div>
                ))
              ) : (
                <Typography.Text type="secondary">Chưa phân công</Typography.Text>
              ),
          },
          {
            title: 'Số tiết/tuần',
            children: [
              { title: 'Định mức', width: 66, align: 'center', render: (_, r) => periods(r.norm) },
              {
                title: 'Được giảm',
                width: 66,
                align: 'center',
                render: (_, r) =>
                  r.reduced ? (
                    <Tooltip
                      title={r.reductions.map((x) => (
                        <div key={x.label}>
                          {x.label}: {periods(x.periods)} tiết
                        </div>
                      ))}
                    >
                      <span style={{ borderBottom: '1px dotted' }}>{periods(r.reduced)}</span>
                    </Tooltip>
                  ) : (
                    ''
                  ),
              },
              { title: 'Phải dạy', width: 66, align: 'center', render: (_, r) => <b>{periods(r.required)}</b> },
              { title: 'Được phân công', width: 76, align: 'center', render: (_, r) => periods(r.assigned) },
              {
                title: 'Thừa (+), thiếu (-)',
                width: 84,
                align: 'center',
                render: (_, r) => <Tag color={r.difference > 0 ? 'blue' : r.difference < 0 ? 'orange' : 'green'}>{signed(r.difference)}</Tag>,
              },
            ],
          },
          {
            title: 'Cảnh báo',
            width: 210,
            render: (_, r) =>
              r.warnings.map((w) => (
                <Typography.Text key={w} type="danger" style={{ display: 'block', fontSize: 12 }}>
                  <WarningOutlined /> {w}
                </Typography.Text>
              )),
          },
        ]}
      />
    </>
  );
}
