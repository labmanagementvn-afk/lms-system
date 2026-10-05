'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Result, Row, Space, Spin, Table, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { ApiError } from '@/lib/api';
import { EMPLOYEE_DOCUMENT_KIND, EMPLOYMENT_TYPE, GENDER, LEAVE_TYPE, vnd } from '@/lib/labels';
import { LeaveRequestModal } from './LeaveModals';
import { EmployeeStatusTag, ExpiryTag, fmtDate, fmtDateTime, LeaveStatusTag } from './shared';

/** What a teacher sees on /hr: their own file and leave requests. */
export function MyHrPanel() {
  const { data: me, error, isLoading } = useSWR<any>(['/hr/me']);
  const { data: leave, mutate: mutateLeave } = useSWR<any>(me ? ['/hr/me/leave', { pageSize: 50 }] : null);
  const [requesting, setRequesting] = useState(false);

  if (isLoading) return <Spin />;
  if (error) {
    const status = (error as ApiError).status;
    return <Result status={status === 404 ? 'info' : 'error'} title={status === 404 ? 'Chưa có hồ sơ nhân sự' : 'Không tải được hồ sơ'} subTitle={status === 404 ? 'Văn phòng nhà trường chưa tạo hồ sơ nhân sự cho tài khoản của bạn.' : (error as Error).message} />;
  }
  if (!me) return null;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card
          size="small"
          title={
            <Space>
              <span>
                {me.code} · {me.fullName}
              </span>
              <EmployeeStatusTag status={me.status} />
            </Space>
          }
        >
          <Descriptions
            size="small"
            column={1}
            items={[
              { label: 'Bộ phận', children: me.department },
              { label: 'Chức vụ', children: me.position },
              { label: 'Hình thức', children: EMPLOYMENT_TYPE[me.employmentType] },
              { label: 'Ngày vào làm', children: fmtDate(me.hireDate) },
              { label: 'Giới tính', children: me.gender ? GENDER[me.gender] : '' },
              { label: 'Ngày sinh', children: fmtDate(me.dateOfBirth) },
              { label: 'Điện thoại', children: me.phone },
              { label: 'Email', children: me.email },
              { label: 'Địa chỉ', children: me.address },
            ]}
          />
        </Card>
        <Card size="small" title="Hợp đồng" style={{ marginTop: 16 }}>
          <Table<any>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={me.contracts}
            columns={[
              { title: 'Loại', dataIndex: 'type', render: (t) => EMPLOYMENT_TYPE[t] },
              { title: 'Từ', dataIndex: 'startDate', width: 100, render: fmtDate },
              { title: 'Đến', width: 150, render: (_, r) => <ExpiryTag date={r.endDate} daysLeft={r.daysLeft} /> },
              { title: 'Lương', dataIndex: 'salary', align: 'right', render: (v) => (v != null ? vnd(v) : '') },
            ]}
          />
        </Card>
        <Card size="small" title="Giấy tờ" style={{ marginTop: 16 }}>
          <Table<any>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={me.documents}
            columns={[
              { title: 'Loại', dataIndex: 'kind', width: 100, render: (k) => EMPLOYEE_DOCUMENT_KIND[k] },
              { title: 'Tên', dataIndex: 'name' },
              { title: 'Hạn', width: 150, render: (_, r) => <ExpiryTag date={r.expiresAt} daysLeft={r.daysLeft} /> },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={14}>
        <Card
          size="small"
          title="Đơn nghỉ phép của tôi"
          extra={
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setRequesting(true)}>
              Xin nghỉ phép
            </Button>
          }
        >
          <Table<any>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={leave?.items}
            columns={[
              { title: 'Loại', dataIndex: 'type', width: 140, render: (t) => LEAVE_TYPE[t] },
              { title: 'Thời gian', width: 190, render: (_, r) => `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}` },
              { title: 'Ngày', dataIndex: 'days', width: 60, align: 'right' },
              { title: 'Lý do', dataIndex: 'reason', ellipsis: true },
              { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (s) => <LeaveStatusTag status={s} /> },
              {
                title: 'Phản hồi',
                render: (_, r) =>
                  r.decidedAt ? (
                    <Typography.Text type="secondary">
                      {fmtDateTime(r.decidedAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                    </Typography.Text>
                  ) : null,
              },
            ]}
          />
        </Card>
      </Col>
      <LeaveRequestModal open={requesting} self onClose={() => setRequesting(false)} onSaved={() => mutateLeave()} />
    </Row>
  );
}
