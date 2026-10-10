'use client';

import { CheckCircleTwoTone, FilePdfOutlined, FileAddOutlined, SignatureOutlined } from '@ant-design/icons';
import { Alert, App, Button, Empty, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/PageHeader';
import { RecordDrawer } from '@/components/esign/RecordDrawer';
import { downloadFile } from '@/components/grades/download';
import { formatDateTime } from '@/components/lms/format';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClasses } from '@/lib/hooks';
import { ERECORD_STATUS } from '@/lib/labels';

/**
 * Học bạ số: the year's transcripts of a class frozen as records, signed by the
 * homeroom teacher and then the principal, printed and checked from the paper.
 */
export default function RecordsPage() {
  const { message, modal } = App.useApp();
  const { me } = useAuth();
  const tz = me!.school.timezone;
  const isTeacher = me?.role === 'TEACHER';
  const { data: classes } = useClasses();
  const own = useMemo(() => (classes ?? []).filter((c) => !isTeacher || c.homeroomTeacherId === me?.teacherId), [classes, isTeacher, me?.teacherId]);
  const [classId, setClassId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<'generate' | 'sign' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, mutate } = useSWR<any>(classId ? ['/erecords', { classId }] : null);
  const { data: profile } = useSWR<any>(['/esign/profile']);

  useEffect(() => {
    if (!classId && own.length) setClassId(own[0].id);
  }, [own, classId]);

  const canSign = data?.canSign ?? { homeroom: false, principal: false };
  // Rows the caller can sign now: drafts for the homeroom teacher, homeroom-signed ones for the principal.
  const signable = (s: any) => (canSign.homeroom && s.record?.status === 'DRAFT') || (canSign.principal && s.record?.status === 'HOMEROOM_SIGNED');
  const rows = (data?.students ?? []).filter((s: any) => !status || (s.record?.status ?? 'NONE') === status);
  const canGenerate = !isTeacher || canSign.homeroom;

  async function generate() {
    setBusy('generate');
    try {
      const r = await api('/erecords/generate', { method: 'POST', body: { classId } });
      const blocked = r.skipped.filter((s: any) => s.reason !== 'Đã có học bạ số');
      if (blocked.length) modal.info({ title: `Đã tạo ${r.created} học bạ số`, content: blocked.map((s: any) => `${s.name}: ${s.reason}`).join('\n'), okText: 'Đóng' });
      else message.success(`Đã tạo ${r.created} học bạ số`);
      mutate();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function sign() {
    modal.confirm({
      title: `Ký số ${selected.length} học bạ?`,
      content: `Ký với tư cách ${canSign.principal ? 'Hiệu trưởng' : 'giáo viên chủ nhiệm'} bằng tài khoản ${profile?.profile?.providerLabel} ${profile?.profile?.account}. Dịch vụ ký số sẽ yêu cầu xác nhận trên điện thoại.`,
      okText: 'Ký số',
      cancelText: 'Hủy',
      onOk: async () => {
        setBusy('sign');
        try {
          const r = await api('/erecords/sign', { method: 'POST', body: { ids: selected } });
          if (r.failed.length) modal.warning({ title: `Đã ký ${r.signed} học bạ`, content: r.failed.map((f: any) => `${f.name}: ${f.error}`).join('\n'), okText: 'Đóng' });
          else message.success(`Đã ký ${r.signed} học bạ`);
          setSelected([]);
          mutate();
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setBusy(null);
        }
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Học bạ số"
        extra={
          <Select
            style={{ width: 200 }}
            placeholder="Chọn lớp"
            value={classId}
            onChange={(v) => (setClassId(v), setSelected([]), setStatus(undefined))}
            optionFilterProp="label"
            showSearch
            options={own.map((c) => ({ value: c.id, label: `Lớp ${c.name}` }))}
          />
        }
      />
      {!own.length && <Empty description={isTeacher ? 'Bạn chưa chủ nhiệm lớp nào' : 'Chưa có lớp'} />}
      {(canSign.homeroom || canSign.principal) && profile && !profile.profile && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Bạn chưa khai báo tài khoản ký số"
          description={
            <>
              Khai báo tài khoản VNPT SmartCA hoặc Viettel MySign ở <Link href="/account">Tài khoản</Link> để ký học bạ.
            </>
          }
        />
      )}
      {data && (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            {Object.entries(ERECORD_STATUS).map(([key, s]) => (
              <Tag.CheckableTag key={key} checked={status === key} onChange={(on) => setStatus(on ? key : undefined)}>
                <Tag color={s.color} style={{ marginInlineEnd: 4 }}>
                  {data.counts[key] ?? 0}
                </Tag>
                {s.label}
              </Tag.CheckableTag>
            ))}
          </Space>
          <Space wrap style={{ marginBottom: 12, display: 'flex' }}>
            {canGenerate && (
              <Tooltip title="Chốt kết quả cả năm của học sinh thành học bạ số chờ ký; học sinh đã có học bạ số được bỏ qua">
                <Button icon={<FileAddOutlined />} loading={busy === 'generate'} onClick={generate}>
                  Tạo học bạ số cho lớp
                </Button>
              </Tooltip>
            )}
            {(canSign.homeroom || canSign.principal) && (
              <Button type="primary" icon={<SignatureOutlined />} disabled={!selected.length || !profile?.profile} loading={busy === 'sign'} onClick={sign}>
                Ký số {selected.length ? `${selected.length} học bạ` : ''}
              </Button>
            )}
            <Typography.Text type="secondary">
              Năm học {data.class.academicYear.name} · GVCN {data.class.homeroomTeacher?.fullName ?? 'chưa phân công'}
            </Typography.Text>
          </Space>
        </>
      )}
      {classId && (
        <Table<any>
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 900 }}
          rowSelection={
            canSign.homeroom || canSign.principal
              ? {
                  selectedRowKeys: (data?.students ?? []).filter((s: any) => selected.includes(s.record?.id)).map((s: any) => s.id),
                  onChange: (_, picked) => setSelected(picked.map((s: any) => s.record.id)),
                  getCheckboxProps: (s: any) => ({ disabled: !signable(s) }),
                }
              : undefined
          }
          columns={[
            { title: 'STT', width: 55, align: 'center', render: (_, __, i) => i + 1 },
            {
              title: 'Học sinh',
              render: (_, s) => (
                <>
                  <b>{s.fullName}</b>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{s.code}</div>
                </>
              ),
            },
            {
              title: 'Trạng thái',
              width: 170,
              render: (_, s) => {
                const st = ERECORD_STATUS[s.record?.status ?? 'NONE'];
                return (
                  <>
                    <Tag color={st.color}>{st.label}</Tag>
                    {!s.record && !s.hasResults && <div style={{ fontSize: 12, color: '#64748b' }}>Chưa có kết quả cả năm</div>}
                    {s.record?.status === 'REVOKED' && <div style={{ fontSize: 12, color: '#dc2626' }}>{s.record.revokedReason}</div>}
                  </>
                );
              },
            },
            {
              title: 'Chữ ký số',
              width: 300,
              render: (_, s) =>
                (s.record?.signatures ?? []).map((g: any) => (
                  <div key={g.role} style={{ fontSize: 13 }}>
                    <CheckCircleTwoTone twoToneColor="#16a34a" /> {g.role === 'HOMEROOM' ? 'GVCN' : 'Hiệu trưởng'} {g.name}
                    <span style={{ color: '#64748b' }}> · {formatDateTime(g.signedAt, tz)}</span>
                  </div>
                )),
            },
            { title: 'Phiên bản', width: 90, align: 'center', render: (_, s) => (s.record ? s.record.version : '') },
            {
              title: '',
              width: 130,
              render: (_, s) =>
                s.record && (
                  <Space>
                    <Button size="small" onClick={() => setOpenId(s.record.id)}>
                      Xem
                    </Button>
                    <Tooltip title="Tải PDF">
                      <Button
                        size="small"
                        icon={<FilePdfOutlined />}
                        aria-label="Tải PDF"
                        onClick={() => downloadFile(`/erecords/${s.record.id}/pdf`, {}, `hoc-ba-so-${s.code}-v${s.record.version}.pdf`).catch((e) => message.error((e as Error).message))}
                      />
                    </Tooltip>
                  </Space>
                ),
            },
          ]}
        />
      )}
      <RecordDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => mutate()} />
    </>
  );
}
