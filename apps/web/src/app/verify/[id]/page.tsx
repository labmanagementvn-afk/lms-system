'use client';

import { CheckCircleTwoTone, CloseCircleTwoTone } from '@ant-design/icons';
import { Alert, Card, Descriptions, List, Result, Spin, Tag, Typography } from 'antd';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import useSWR from 'swr';
import { formatDate, formatDateTime } from '@/components/lms/format';
import { ERECORD_STATUS } from '@/lib/labels';

const TZ = 'Asia/Ho_Chi_Minh';

/** Tra cứu học bạ số: public page reached from the link and code printed on a signed record. */
export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const { id } = useParams<{ id: string }>();
  const code = useSearchParams().get('code') ?? '';
  const { data: r, error, isLoading } = useSWR<any>(id && code ? [`/public/erecords/${id}`, { code }] : null);

  return (
    <div style={{ minHeight: '100vh', padding: '24px 12px 40px', background: '#f8fafc' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            Tra cứu học bạ số
          </Typography.Title>
          <Typography.Text type="secondary">Kiểm tra nội dung và chữ ký số của học bạ theo mã tra cứu in trên bản giấy</Typography.Text>
        </div>
        {isLoading && (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
            <Spin size="large" />
          </div>
        )}
        {(error || (!code && !isLoading)) && <Result status="404" title="Không tìm thấy học bạ số" subTitle="Kiểm tra lại đường dẫn và mã tra cứu in trên học bạ." />}
        {r && (
          <>
            <Result
              status={r.valid ? 'success' : 'error'}
              title={r.valid ? 'Học bạ số hợp lệ' : r.status === 'REVOKED' ? 'Học bạ số đã bị thu hồi' : !r.contentIntact ? 'Nội dung học bạ đã bị thay đổi' : 'Học bạ số chưa được phát hành'}
              subTitle={r.valid ? `Do ${r.school} phát hành ngày ${formatDate(r.issuedAt, TZ)}` : r.revokedReason ? `Lý do: ${r.revokedReason}` : undefined}
              style={{ padding: '16px 0 0' }}
            />
            {r.sandbox && <Alert type="warning" showIcon message="Bản thử nghiệm: chữ ký số do môi trường thử nghiệm tạo ra, không có giá trị pháp lý." />}
            <Card size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Học sinh">{r.student.fullName}</Descriptions.Item>
                <Descriptions.Item label="Ngày sinh">{r.student.dateOfBirth}</Descriptions.Item>
                <Descriptions.Item label="Mã học sinh">{r.student.code}</Descriptions.Item>
                <Descriptions.Item label="Trường">{r.school}</Descriptions.Item>
                <Descriptions.Item label="Lớp, năm học">
                  {r.className}, {r.academicYear}
                </Descriptions.Item>
                <Descriptions.Item label="Trạng thái">
                  <Tag color={ERECORD_STATUS[r.status].color}>{ERECORD_STATUS[r.status].label}</Tag> phiên bản {r.version}
                </Descriptions.Item>
                <Descriptions.Item label="Mã băm SHA-256">
                  <Typography.Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                    {r.contentHash}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
            <List
              size="small"
              bordered
              header={<b>Chữ ký số</b>}
              dataSource={r.signatures}
              style={{ background: '#fff' }}
              renderItem={(s: any) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={s.valid ? <CheckCircleTwoTone twoToneColor="#16a34a" style={{ fontSize: 20 }} /> : <CloseCircleTwoTone twoToneColor="#dc2626" style={{ fontSize: 20 }} />}
                    title={`${s.title}: ${s.name}`}
                    description={`${s.providerLabel} · ký lúc ${formatDateTime(s.signedAt, TZ)} · sê-ri ${s.certSerial}`}
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </div>
    </div>
  );
}
