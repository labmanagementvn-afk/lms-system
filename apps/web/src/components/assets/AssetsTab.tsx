'use client';

import { EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space, Table } from 'antd';
import { useState } from 'react';
import useSWR from 'swr';
import { ASSET_STATUS, vnd } from '@/lib/labels';
import { AssetDrawer } from './AssetDrawer';
import { AssetModal } from './AssetModal';
import { AssetStatusTag, employeeLabel, fmtDate, useCategories } from './shared';

const statusOptions = Object.entries(ASSET_STATUS).map(([value, s]) => ({ value, label: s.label }));

export function AssetsTab({ onChanged }: { onChanged?: () => void }) {
  const [query, setQuery] = useState({ page: 1, pageSize: 20, q: '', status: undefined as string | undefined, categoryId: undefined as string | undefined, location: '' });
  const { data, isLoading, mutate } = useSWR<any>(['/assets', query]);
  const { data: categories } = useCategories();
  const [editing, setEditing] = useState<any | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  function changed() {
    mutate();
    onChanged?.();
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Tìm theo mã, tên, serial" allowClear onSearch={(q) => setQuery({ ...query, q, page: 1 })} style={{ width: 240 }} />
        <Select placeholder="Trạng thái" allowClear options={statusOptions} style={{ width: 160 }} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <Select
          placeholder="Danh mục"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 180 }}
          options={categories?.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(categoryId) => setQuery({ ...query, categoryId, page: 1 })}
        />
        <Input.Search placeholder="Vị trí" allowClear onSearch={(location) => setQuery({ ...query, location, page: 1 })} style={{ width: 160 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
          Thêm tài sản
        </Button>
      </Space>
      <Table<any>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        scroll={{ x: 1100 }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total, onChange: (page, pageSize) => setQuery({ ...query, page, pageSize }) }}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 100 },
          { title: 'Tên tài sản', dataIndex: 'name' },
          { title: 'Danh mục', width: 140, render: (_, r) => r.category?.name },
          { title: 'Vị trí', dataIndex: 'location', width: 130 },
          { title: 'Người quản lý', width: 200, render: (_, r) => (r.custodian ? employeeLabel(r.custodian) : '') },
          { title: 'Ngày mua', dataIndex: 'purchaseDate', width: 100, render: fmtDate },
          { title: 'Nguyên giá', dataIndex: 'purchasePrice', width: 130, align: 'right', render: (v) => (v != null ? vnd(v) : '') },
          { title: 'Còn lại', dataIndex: 'bookValue', width: 130, align: 'right', render: (v) => (v != null ? vnd(v) : '') },
          { title: 'Trạng thái', dataIndex: 'status', width: 130, render: (s) => <AssetStatusTag status={s} /> },
          {
            title: '',
            width: 90,
            render: (_, r) => (
              <Space onClick={(ev) => ev.stopPropagation()}>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenId(r.id)} aria-label="Xem" />
                <Button size="small" icon={<EditOutlined />} disabled={r.status === 'DISPOSED'} onClick={() => setEditing(r)} aria-label="Sửa" />
              </Space>
            ),
          },
        ]}
      />
      <AssetModal record={editing} onClose={() => setEditing(null)} onSaved={changed} />
      <AssetDrawer assetId={openId} onClose={() => setOpenId(null)} onChanged={changed} />
    </>
  );
}
