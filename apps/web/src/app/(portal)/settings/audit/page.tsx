'use client';

import { Typography } from 'antd';
import { AuditTable } from '@/components/audit/AuditTable';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth';

/** Nhật ký hệ thống: every change made through the API at this school. */
export default function AuditPage() {
  const tz = useAuth().me!.school.timezone;
  return (
    <>
      <PageHeader title="Nhật ký hệ thống" />
      <Typography.Paragraph type="secondary">
        Mọi thao tác thêm, sửa, xóa qua hệ thống đều được ghi lại kèm người thực hiện, dữ liệu gửi lên (mật khẩu và khóa bí mật đã được ẩn) và kết quả. Các lần đăng nhập sai vào tài khoản của trường cũng xuất hiện ở đây.
      </Typography.Paragraph>
      <AuditTable endpoint="/audit" areasEndpoint="/audit/areas" tz={tz} />
    </>
  );
}
