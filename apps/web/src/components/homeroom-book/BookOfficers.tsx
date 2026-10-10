'use client';

import { MinusCircleOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Card, Col, Form, Row, Select, Space, Table, Typography } from 'antd';
import { useEffect, useMemo } from 'react';
import { COMMITTEE_ROLES, OFFICER_ROLES, RELATIONSHIP } from '@/lib/labels';
import { Book, SaveBook } from './types';

const roleOptions = (roles: string[]) => roles.map((value) => ({ value }));
const filter = (input: string, o?: { value: string }) => !!o?.value.toLowerCase().includes(input.toLowerCase());

/** Ban cán sự lớp and Ban đại diện cha mẹ học sinh of the class. */
export function BookOfficers({ book, save }: { book: Book; save: SaveBook }) {
  const [officers] = Form.useForm();
  const [committee] = Form.useForm();

  useEffect(() => {
    officers.setFieldsValue({ items: book.officers.map((o) => ({ role: o.role, studentId: o.student.id })) });
    committee.setFieldsValue({ items: book.parentCommittee.map((m) => ({ role: m.role, guardianId: m.guardian.id })) });
  }, [book, officers, committee]);

  const students = useMemo(() => book.students.map((s) => ({ value: s.id, label: s.fullName })), [book]);
  const guardians = useMemo(
    () =>
      book.students.flatMap((s) =>
        s.guardians.map((g) => ({ value: g.id, label: `${g.fullName} (${RELATIONSHIP[g.relationship]?.toLowerCase()} em ${s.fullName}) · ${g.phone}` })),
      ),
    [book],
  );

  async function saveOfficers() {
    const v = await officers.validateFields();
    await save({ officers: v.items ?? [] }, 'Đã lưu ban cán sự lớp');
  }

  async function saveCommittee() {
    const v = await committee.validateFields();
    await save({ parentCommittee: v.items ?? [] }, 'Đã lưu ban đại diện cha mẹ học sinh');
  }

  if (!book.editable) {
    return (
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Ban cán sự lớp">
            <Table size="small" rowKey={(r) => `${r.role}|${r.student.id}`} pagination={false} dataSource={book.officers} locale={{ emptyText: 'Chưa ghi' }} columns={[{ title: 'Chức vụ', dataIndex: 'role' }, { title: 'Học sinh', render: (_, r) => r.student.fullName }]} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Ban đại diện cha mẹ học sinh">
            <Table
              size="small"
              rowKey={(r) => r.guardian.id}
              pagination={false}
              dataSource={book.parentCommittee}
              locale={{ emptyText: 'Chưa ghi' }}
              columns={[
                { title: 'Chức vụ', dataIndex: 'role' },
                { title: 'Họ và tên', render: (_, r) => r.guardian.fullName },
                { title: 'Cha mẹ của', render: (_, r) => r.student.fullName },
                { title: 'Điện thoại', render: (_, r) => r.guardian.phone },
              ]}
            />
          </Card>
        </Col>
      </Row>
    );
  }

  return (
    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title="Ban cán sự lớp"
          extra={
            <Button type="primary" size="small" icon={<SaveOutlined />} onClick={saveOfficers}>
              Lưu
            </Button>
          }
        >
          <Typography.Paragraph type="secondary">Lớp trưởng, các lớp phó, ban chỉ huy chi đội hoặc chi đoàn. Tổ trưởng ghi ở mục Tổ và chỗ ngồi.</Typography.Paragraph>
          <Form form={officers}>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((f) => (
                    <Space key={f.key} align="start" style={{ display: 'flex' }}>
                      <Form.Item name={[f.name, 'role']} rules={[{ required: true, message: 'Nhập chức vụ' }]} style={{ width: 200, marginBottom: 8 }}>
                        <AutoComplete options={roleOptions(OFFICER_ROLES)} filterOption={filter} placeholder="Chức vụ" />
                      </Form.Item>
                      <Form.Item name={[f.name, 'studentId']} rules={[{ required: true, message: 'Chọn học sinh' }]} style={{ width: 240, marginBottom: 8 }}>
                        <Select showSearch optionFilterProp="label" options={students} placeholder="Học sinh" />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(f.name)} style={{ marginTop: 8 }} aria-label="Bỏ dòng" />
                    </Space>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ role: OFFICER_ROLES[fields.length] ?? '' })}>
                    Thêm chức vụ
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title="Ban đại diện cha mẹ học sinh"
          extra={
            <Button type="primary" size="small" icon={<SaveOutlined />} onClick={saveCommittee}>
              Lưu
            </Button>
          }
        >
          <Typography.Paragraph type="secondary">Do cha mẹ học sinh của lớp bầu ra đầu năm học, gồm trưởng ban, phó trưởng ban và ủy viên.</Typography.Paragraph>
          <Form form={committee}>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((f) => (
                    <Space key={f.key} align="start" style={{ display: 'flex' }}>
                      <Form.Item name={[f.name, 'role']} rules={[{ required: true, message: 'Nhập chức vụ' }]} style={{ width: 150, marginBottom: 8 }}>
                        <AutoComplete options={roleOptions(COMMITTEE_ROLES)} filterOption={filter} placeholder="Chức vụ" />
                      </Form.Item>
                      <Form.Item name={[f.name, 'guardianId']} rules={[{ required: true, message: 'Chọn phụ huynh' }]} style={{ width: 330, marginBottom: 8 }}>
                        <Select showSearch optionFilterProp="label" options={guardians} placeholder="Phụ huynh" />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(f.name)} style={{ marginTop: 8 }} aria-label="Bỏ dòng" />
                    </Space>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ role: fields.length === 0 ? 'Trưởng ban' : fields.length === 1 ? 'Phó trưởng ban' : 'Ủy viên' })}>
                    Thêm thành viên
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        </Card>
      </Col>
    </Row>
  );
}
