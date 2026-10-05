'use client';

import { Card, Descriptions, Empty, List, Spin, Tag, Typography } from 'antd';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { INCIDENT_SEVERITY } from '@/lib/labels';
import { useParent } from '@/lib/parent';
import { formatTime } from '@/lib/time';

const d = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

export default function ParentHealthPage() {
  const tz = useAuth().me!.school.timezone;
  const { child, loading } = useParent();
  const { data, isLoading } = useSWR<any>(child ? [`/parent/children/${child.id}/health`] : null);

  if (loading || (child && isLoading)) return <Spin style={{ display: 'block', margin: '48px auto' }} />;
  if (!child) return <Empty description="Chưa có học sinh" style={{ marginTop: 48 }} />;

  const p = data?.profile;
  const latest = data?.checks?.[0];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Typography.Text strong>Sức khỏe · {child.fullName}</Typography.Text>
      <Card size="small" title="Hồ sơ sức khỏe">
        {p ? (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Nhóm máu">{p.bloodType ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Dị ứng">{p.allergies ?? 'Không'}</Descriptions.Item>
            <Descriptions.Item label="Bệnh mãn tính">{p.chronicConditions ?? 'Không'}</Descriptions.Item>
            <Descriptions.Item label="Thẻ BHYT">
              {p.insuranceNumber ?? 'Chưa có'}
              {p.insuranceExpiry ? ` (hết hạn ${d(p.insuranceExpiry)})` : ''}
            </Descriptions.Item>
            {p.notes && <Descriptions.Item label="Ghi chú">{p.notes}</Descriptions.Item>}
          </Descriptions>
        ) : (
          <Typography.Text type="secondary">Nhà trường chưa cập nhật hồ sơ sức khỏe.</Typography.Text>
        )}
      </Card>

      <Card size="small" title="Khám sức khỏe định kỳ">
        {latest ? (
          <>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Ngày khám">{d(latest.checkedAt)}</Descriptions.Item>
              <Descriptions.Item label="BMI">{latest.bmi ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Chiều cao">{latest.heightCm ? `${latest.heightCm} cm` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Cân nặng">{latest.weightKg ? `${latest.weightKg} kg` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Thị lực">{latest.visionLeft || latest.visionRight ? `${latest.visionLeft ?? '—'} / ${latest.visionRight ?? '—'}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Răng miệng">{latest.dental ?? '—'}</Descriptions.Item>
            </Descriptions>
            {latest.conclusion && <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>Kết luận: {latest.conclusion}</Typography.Paragraph>}
            {data.checks.length > 1 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {data.checks.length - 1} lần khám trước: {data.checks.slice(1).map((c: any) => `${d(c.checkedAt)} (${c.heightCm ?? '?'} cm, ${c.weightKg ?? '?'} kg)`).join('; ')}
              </Typography.Text>
            )}
          </>
        ) : (
          <Typography.Text type="secondary">Chưa có lần khám nào.</Typography.Text>
        )}
      </Card>

      <Card size="small" title="Tiêm chủng">
        <List
          size="small"
          dataSource={data?.vaccinations ?? []}
          locale={{ emptyText: 'Chưa ghi nhận mũi tiêm nào' }}
          renderItem={(v: any) => (
            <List.Item style={{ padding: '6px 0' }}>
              <List.Item.Meta title={`${v.vaccine} · mũi ${v.dose}`} description={`${d(v.givenAt)}${v.notes ? ` · ${v.notes}` : ''}`} />
            </List.Item>
          )}
        />
      </Card>

      <Card size="small" title="Sự cố y tế">
        <List
          size="small"
          dataSource={data?.incidents ?? []}
          locale={{ emptyText: 'Không có sự cố nào' }}
          renderItem={(i: any) => {
            const sev = INCIDENT_SEVERITY[i.severity];
            return (
              <List.Item style={{ padding: '6px 0' }}>
                <List.Item.Meta
                  title={
                    <span>
                      {new Date(i.occurredAt).toLocaleDateString('vi-VN', { timeZone: tz })} {formatTime(i.occurredAt, tz)} <Tag color={sev?.color}>{sev?.label}</Tag>
                    </span>
                  }
                  description={
                    <>
                      <div>{i.description}</div>
                      {i.treatment && <div>Xử trí: {i.treatment}</div>}
                    </>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Card>
    </div>
  );
}
