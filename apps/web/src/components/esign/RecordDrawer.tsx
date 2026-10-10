'use client';

import { CheckCircleTwoTone, CloseCircleTwoTone, FilePdfOutlined, LinkOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Drawer, Input, List, Modal, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { downloadFile } from '@/components/grades/download';
import { formatDateTime } from '@/components/lms/format';
import { ReportPreview } from '@/components/reports/ReportPreview';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ERECORD_STATUS } from '@/lib/labels';

/** One học bạ số: its check (content hash and signatures), versions, the printed form, and revoking it. */
export function RecordDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { message } = App.useApp();
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const [viewId, setViewId] = useState<string | null>(null);
  const shown = viewId ?? id;
  const { data: r, mutate } = useSWR<any>(shown ? [`/erecords/${shown}`] : null);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');

  async function revoke() {
    try {
      await mutate(await api(`/erecords/${shown}/revoke`, { method: 'POST', body: { reason } }), { revalidate: false });
      message.success('Đã thu hồi học bạ; có thể tạo phiên bản mới');
      setRevoking(false);
      setReason('');
      onChanged();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  const close = () => (setViewId(null), onClose());
  const verifyUrl = r ? `/verify/${r.id}?code=${r.code}` : '';

  return (
    <Drawer open={!!id} onClose={close} width={860} title={r ? `Học bạ số: ${r.student.fullName}` : 'Học bạ số'} destroyOnHidden>
      {r && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type={r.check.valid ? 'success' : r.status === 'REVOKED' || !r.check.contentIntact ? 'error' : 'info'}
            showIcon
            message={
              r.check.valid
                ? 'Học bạ đã phát hành, nội dung và chữ ký số hợp lệ'
                : !r.check.contentIntact
                  ? 'Nội dung đã bị thay đổi sau khi tạo: chữ ký số không còn giá trị'
                  : r.status === 'REVOKED'
                    ? `Đã thu hồi: ${r.revokedReason}`
                    : ERECORD_STATUS[r.status].label
            }
            description={r.check.sandbox ? 'Chữ ký số do môi trường thử nghiệm tạo ra, không có giá trị pháp lý.' : undefined}
          />
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Lớp">
              {r.class.name}, năm học {r.class.academicYear.name}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color={ERECORD_STATUS[r.status].color}>{ERECORD_STATUS[r.status].label}</Tag> phiên bản {r.version}
            </Descriptions.Item>
            <Descriptions.Item label="Mã tra cứu">{r.code}</Descriptions.Item>
            <Descriptions.Item label="Phát hành">{formatDateTime(r.issuedAt, tz)}</Descriptions.Item>
            <Descriptions.Item label="Mã băm SHA-256" span={2}>
              <Typography.Text code style={{ fontSize: 12 }}>
                {r.contentHash}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
          <List
            size="small"
            header={<b>Chữ ký số</b>}
            bordered
            dataSource={r.check.signatures}
            locale={{ emptyText: 'Chưa có chữ ký' }}
            renderItem={(s: any) => (
              <List.Item>
                <List.Item.Meta
                  avatar={s.valid && s.certValid ? <CheckCircleTwoTone twoToneColor="#16a34a" style={{ fontSize: 20 }} /> : <CloseCircleTwoTone twoToneColor="#dc2626" style={{ fontSize: 20 }} />}
                  title={`${s.title}: ${s.name}`}
                  description={
                    <>
                      {s.providerLabel} · {formatDateTime(s.signedAt, tz)} · {s.valid ? 'chữ ký hợp lệ' : 'chữ ký không hợp lệ'}
                      <div style={{ fontSize: 12 }}>
                        {s.certSubject} · sê-ri {s.certSerial}
                      </div>
                    </>
                  }
                />
              </List.Item>
            )}
          />
          {r.versions.length > 1 && (
            <Space wrap>
              <span>Phiên bản:</span>
              {r.versions.map((v: any) => (
                <Tag.CheckableTag key={v.id} checked={v.id === r.id} onChange={() => setViewId(v.id === id ? null : v.id)}>
                  {v.version} · {ERECORD_STATUS[v.status].label}
                </Tag.CheckableTag>
              ))}
            </Space>
          )}
          <Space wrap>
            <Button icon={<FilePdfOutlined />} onClick={() => downloadFile(`/erecords/${r.id}/pdf`, {}, `hoc-ba-so-${r.student.code}-v${r.version}.pdf`).catch((e) => message.error((e as Error).message))}>
              Tải PDF
            </Button>
            <Button icon={<LinkOutlined />} href={verifyUrl} target="_blank">
              Trang tra cứu
            </Button>
            {me?.role === 'ADMIN' && r.status !== 'REVOKED' && (
              <Button danger icon={<StopOutlined />} onClick={() => setRevoking(true)}>
                Thu hồi
              </Button>
            )}
          </Space>
          <ReportPreview document={r.content.document} letterhead={r.content.letterhead} />
        </Space>
      )}
      <Modal open={revoking} title="Thu hồi học bạ số" okText="Thu hồi" okButtonProps={{ danger: true, disabled: !reason.trim() }} cancelText="Hủy" onOk={revoke} onCancel={() => setRevoking(false)}>
        <Typography.Paragraph type="secondary">Học bạ bị thu hồi không còn giá trị; tạo phiên bản mới để ký lại.</Typography.Paragraph>
        <Input.TextArea rows={3} placeholder="Lý do thu hồi" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Modal>
    </Drawer>
  );
}
