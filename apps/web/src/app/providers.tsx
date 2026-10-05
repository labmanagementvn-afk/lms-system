'use client';

import '@ant-design/v5-patch-for-react-19';
import { App, ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';

dayjs.locale('vi');

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={viVN} theme={{ token: { colorPrimary: '#1d4ed8', borderRadius: 6 } }}>
      <App>
        <SWRConfig value={{ fetcher, revalidateOnFocus: false }}>
          <AuthProvider>{children}</AuthProvider>
        </SWRConfig>
      </App>
    </ConfigProvider>
  );
}
