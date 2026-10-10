'use client';

import { CheckOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Empty, List, Popconfirm, Spin, Tag, Typography } from 'antd';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { AWARD_FORM, DISCIPLINE_MEASURE, dmy } from '@/lib/labels';
import { useParent } from '@/lib/parent';

/** The child's commendations and discipline this school year; the family confirms a self-review here (Thông tư 19/2025). */
export default function ParentMeritsPage() {
  const { message } = App.useApp();
  const { child, loading } = useParent();
  const { data, isLoading, mutate } = useSWR<{ academicYear: { name: string }; awards: any[]; discipline: any[] }>(child ? [`/parent/children/${child.id}/merits`] : null);

  if (loading) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  async function confirm(id: string) {
    try {
      await api(`/parent/discipline/${id}/confirm`, { method: 'POST' });
      message.success('Đã xác nhận. Cảm ơn gia đình đã phối hợp với nhà trường.');
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const waiting = (data?.discipline ?? []).filter((d) => d.measure === 'SELF_REVIEW' && !d.familyConfirmedAt);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Typography.Text strong>
        Khen thưởng, kỷ luật · {child.fullName}
        {data ? <Typography.Text type="secondary"> · năm học {data.academicYear.name}</Typography.Text> : null}
      </Typography.Text>
      {isLoading && <Spin style={{ display: 'block', margin: '24px auto' }} />}
      {waiting.length > 0 && (
        <Alert type="warning" showIcon message="Gia đình cần xác nhận bản tự kiểm điểm" description="Vui lòng xem bản tự kiểm điểm và cam kết của con cùng con, sau đó xác nhận ở mục Kỷ luật bên dưới." />
      )}

      <Card size="small" title="Khen thưởng" styles={{ body: { padding: '0 12px' } }}>
        <List
          dataSource={data?.awards ?? []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khen thưởng trong năm học" /> }}
          renderItem={(a) => (
            <List.Item style={{ padding: '10px 0' }}>
              <List.Item.Meta
                title={
                  <span>
                    <Tag color="gold">{AWARD_FORM[a.form]}</Tag>
                    <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                      {dmy(a.date)}
                    </Typography.Text>
                  </span>
                }
                description={
                  <>
                    <div style={{ color: '#1f2937' }}>{a.content}</div>
                    {(a.issuer || a.decisionNo) && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {[a.issuer, a.decisionNo && `Quyết định số ${a.decisionNo}`].filter(Boolean).join(' · ')}
                      </Typography.Text>
                    )}
                  </>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="Kỷ luật" styles={{ body: { padding: '0 12px' } }}>
        <List
          dataSource={data?.discipline ?? []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có vi phạm trong năm học" /> }}
          renderItem={(d) => (
            <List.Item style={{ padding: '10px 0', display: 'block' }}>
              <div>
                <Tag color={DISCIPLINE_MEASURE[d.measure].color}>{DISCIPLINE_MEASURE[d.measure].label}</Tag>
                <Typography.Text type="secondary">{dmy(d.date)}</Typography.Text>
              </div>
              <div style={{ marginTop: 4 }}>Vi phạm: {d.violation}</div>
              {d.support && <div style={{ color: '#64748b' }}>Nhà trường hỗ trợ: {d.support}</div>}
              {d.measure === 'SELF_REVIEW' &&
                (d.familyConfirmedAt ? (
                  <Tag color="green" style={{ marginTop: 6 }}>
                    Gia đình đã xác nhận ngày {dmy(d.familyConfirmedAt)}
                  </Tag>
                ) : (
                  <Popconfirm
                    title="Xác nhận bản tự kiểm điểm"
                    description="Gia đình đã xem bản tự kiểm điểm và cam kết của con, và phối hợp với nhà trường giáo dục con."
                    okText="Xác nhận"
                    cancelText="Đóng"
                    onConfirm={() => confirm(d.id)}
                  >
                    <Button type="primary" size="small" icon={<CheckOutlined />} style={{ marginTop: 6 }}>
                      Xác nhận đã xem bản tự kiểm điểm
                    </Button>
                  </Popconfirm>
                ))}
            </List.Item>
          )}
        />
      </Card>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Theo Thông tư 19/2025/TT-BGDĐT, biện pháp kỷ luật nhằm giáo dục, giúp học sinh nhận ra và sửa lỗi. Gia đình liên hệ giáo viên chủ nhiệm nếu cần trao đổi thêm.
      </Typography.Text>
    </div>
  );
}
