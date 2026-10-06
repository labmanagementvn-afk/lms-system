'use client';

import { Typography } from 'antd';
import { AuditTable } from '@/components/audit/AuditTable';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth';

/** The audit trail of every school in the district and of the district's own officers. */
export default function DistrictAuditPage() {
  const tz = useAuth().me!.school.timezone;
  return (
    <>
      <PageHeader title="Nhật ký hệ thống" />
      <Typography.Paragraph type="secondary">Thao tác thêm, sửa, xóa tại các trường trực thuộc và của chuyên viên Phòng/Sở, kèm người thực hiện và kết quả.</Typography.Paragraph>
      <AuditTable endpoint="/district/audit" showSchool tz={tz} />
    </>
  );
}
