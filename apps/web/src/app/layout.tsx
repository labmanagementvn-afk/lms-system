import { AntdRegistry } from '@ant-design/nextjs-registry';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quản lý trường học',
  description: 'Quản lý giáo viên, học sinh, lớp học, thời khóa biểu và điểm danh ra vào trường',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
