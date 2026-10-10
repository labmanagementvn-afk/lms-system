'use client';

import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, AutoComplete, Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, Modal, Radio, Row, Select, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useClasses } from '@/lib/hooks';
import { GENDER, options, POLICY_GROUP, RELATIONSHIP, STUDENT_STATUS } from '@/lib/labels';

const ETHNICITIES = ['Kinh', 'Tày', 'Thái', 'Mường', 'Khmer', 'Hoa', 'Nùng', 'Mông', 'Dao', 'Gia Rai', 'Ê Đê', 'Ba Na', 'Sán Chay', 'Chăm', 'Cơ Ho', 'Xơ Đăng', 'Sán Dìu', 'Hrê', 'Ra Glai', 'Mnông'];
const RELIGIONS = ['Không', 'Phật giáo', 'Công giáo', 'Tin Lành', 'Cao Đài', 'Phật giáo Hòa Hảo', 'Hồi giáo'];
const asOptions = (xs: string[]) => xs.map((value) => ({ value }));

/** Profile fields sent as null when cleared, so an edit can empty them. */
const PROFILE = ['gender', 'address', 'idNumber', 'moetCode', 'birthPlace', 'hometown', 'ethnicity', 'religion', 'nationality', 'currentWard', 'currentProvince', 'permanentAddress', 'permanentWard', 'permanentProvince'] as const;
/** Leaving and coming back go through their own actions, which record the movement. */
const LEFT = ['TRANSFERRED', 'DROPPED'];

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

/**
 * Hồ sơ học sinh: the record as the sổ đăng bộ and CSDL ngành ask for it, in tabs
 * (lý lịch, địa chỉ, gia đình, and on creation how the student entered the school).
 */
export function StudentFormModal({ student, onClose, onSaved }: { student: any | null; onClose: () => void; onSaved: (saved: any) => void }) {
  const { message } = App.useApp();
  const { data: classes } = useClasses();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const open = student !== null;
  const editing = !!student?.id;
  const entryKind = Form.useWatch('entryKind', form);
  const classId = Form.useWatch('classId', form);
  const currentClass = student?.enrollments?.[0]?.class;
  const left = editing && LEFT.includes(student.status);
  // A class of this school year can only change for one of the same grade (chuyển lớp).
  const thisYear = !!currentClass && !!classes?.some((c) => c.id === currentClass.id);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing) {
      form.setFieldsValue({
        ...student,
        dateOfBirth: student.dateOfBirth ? dayjs(student.dateOfBirth) : undefined,
        classId: currentClass?.id,
        guardians: student.guardians.map((g: any) => ({ ...g, email: g.email ?? undefined })),
      });
    } else {
      form.setFieldsValue({ nationality: 'Việt Nam', policyGroups: [], entryKind: 'ENROLLED', entryDate: dayjs(), guardians: [{ relationship: 'MOTHER', isPrimary: true }] });
    }
  }, [open, editing, student, currentClass?.id, form]);

  async function save() {
    const v = await form.validateFields();
    const body: Record<string, unknown> = {
      code: v.code.trim(),
      fullName: v.fullName.trim(),
      dateOfBirth: v.dateOfBirth ? v.dateOfBirth.format('YYYY-MM-DD') : editing ? null : undefined,
      policyGroups: v.policyGroups ?? [],
      youngPioneer: !!v.youngPioneer,
      youthUnion: !!v.youthUnion,
      guardians: (v.guardians ?? []).map((g: any) => ({
        id: g.id || undefined,
        fullName: g.fullName.trim(),
        relationship: g.relationship,
        phone: g.phone.trim(),
        email: text(g.email) || null,
        isPrimary: !!g.isPrimary,
        birthYear: g.birthYear ?? null,
        occupation: text(g.occupation) || null,
        idNumber: text(g.idNumber) || null,
      })),
    };
    for (const k of PROFILE) {
      const value = text(v[k]);
      if (value) body[k] = value;
      else if (editing) body[k] = null;
    }
    if (v.classId && v.classId !== currentClass?.id) body.classId = v.classId;
    if (editing && !left && v.status !== student.status) body.status = v.status;
    if (!editing && v.entryKind) {
      body.entryKind = v.entryKind;
      body.entryDate = v.entryDate?.format('YYYY-MM-DD');
      if (v.entryKind === 'TRANSFER_IN') body.previousSchool = text(v.previousSchool);
    }
    setSaving(true);
    try {
      const saved = editing ? await api(`/students/${student.id}`, { method: 'PATCH', body }) : await api('/students', { method: 'POST', body });
      message.success(editing ? 'Đã lưu hồ sơ học sinh' : 'Đã thêm học sinh');
      onSaved(saved);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const sameAsCurrent = () => {
    const [address, currentWard, currentProvince] = [form.getFieldValue('address'), form.getFieldValue('currentWard'), form.getFieldValue('currentProvince')];
    form.setFieldsValue({ permanentAddress: address, permanentWard: currentWard, permanentProvince: currentProvince });
  };
  const movingClass = editing && thisYear && classId && classId !== currentClass.id;

  return (
    <Modal title={editing ? `Hồ sơ học sinh · ${student.fullName}` : 'Thêm học sinh'} open={open} onOk={save} confirmLoading={saving} onCancel={onClose} okText="Lưu" cancelText="Hủy" width={820} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>
        <Tabs
          items={[
            {
              key: 'profile',
              label: 'Lý lịch',
              forceRender: true,
              children: (
                <Row gutter={12}>
                  <Col xs={24} sm={8}>
                    <Form.Item name="code" label="Mã học sinh" rules={[{ required: true, message: 'Nhập mã học sinh' }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={16}>
                    <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ và tên' }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Form.Item name="gender" label="Giới tính">
                      <Select options={options(GENDER)} allowClear />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Form.Item name="dateOfBirth" label="Ngày sinh">
                      <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Form.Item name="classId" label="Lớp">
                      <Select
                        options={(classes ?? []).filter((c) => !thisYear || c.gradeLevel === currentClass.gradeLevel).map((c) => ({ value: c.id, label: c.name }))}
                        allowClear={!thisYear}
                        showSearch
                        optionFilterProp="label"
                        disabled={left}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={6}>
                    {editing && left && (
                      <Form.Item label="Tình trạng" tooltip="Học sinh trở lại học qua chức năng Tiếp nhận trở lại">
                        <Tag color="orange">{STUDENT_STATUS[student.status]}</Tag>
                      </Form.Item>
                    )}
                    {editing && !left && (
                      <Form.Item name="status" label="Tình trạng" tooltip="Chuyển trường, thôi học dùng các chức năng riêng để ghi vào sổ đăng bộ">
                        <Select options={['STUDYING', 'GRADUATED'].map((s) => ({ value: s, label: STUDENT_STATUS[s] }))} />
                      </Form.Item>
                    )}
                  </Col>
                  {movingClass && (
                    <Col span={24}>
                      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Đổi lớp được ghi nhận là chuyển lớp: điểm, kết quả và đơn xin nghỉ sắp tới của năm học chuyển theo học sinh sang lớp mới." />
                    </Col>
                  )}
                  <Col xs={24} sm={8}>
                    <Form.Item name="idNumber" label="Mã định danh cá nhân" rules={[{ pattern: /^\d{12}$/, message: 'Gồm 12 chữ số (số CCCD)' }]}>
                      <Input maxLength={12} placeholder="12 chữ số" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item name="moetCode" label="Mã học sinh trên CSDL ngành">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item name="nationality" label="Quốc tịch">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Form.Item name="ethnicity" label="Dân tộc">
                      <AutoComplete options={asOptions(ETHNICITIES)} filterOption={(input, o) => !!o?.value.toLowerCase().includes(input.toLowerCase())} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Form.Item name="religion" label="Tôn giáo">
                      <AutoComplete options={asOptions(RELIGIONS)} filterOption={(input, o) => !!o?.value.toLowerCase().includes(input.toLowerCase())} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item label="Đoàn, Đội">
                      <Form.Item name="youngPioneer" valuePropName="checked" noStyle>
                        <Checkbox>Đội viên</Checkbox>
                      </Form.Item>
                      <Form.Item name="youthUnion" valuePropName="checked" noStyle>
                        <Checkbox>Đoàn viên</Checkbox>
                      </Form.Item>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="birthPlace" label="Nơi sinh">
                      <Input placeholder="Tỉnh/thành phố" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="hometown" label="Quê quán">
                      <Input placeholder="Tỉnh/thành phố" />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name="policyGroups" label="Diện chính sách" extra="Căn cứ để miễn, giảm học phí và hỗ trợ chi phí học tập">
                      <Select mode="multiple" options={options(POLICY_GROUP)} placeholder="Không thuộc diện chính sách" />
                    </Form.Item>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'address',
              label: 'Địa chỉ',
              forceRender: true,
              children: (
                <>
                  <Card size="small" title="Chỗ ở hiện nay" style={{ marginBottom: 12 }}>
                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Item name="address" label="Số nhà, đường phố, thôn/xóm">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="currentWard" label="Phường, xã, đặc khu">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="currentProvince" label="Tỉnh, thành phố">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                  <Card size="small" title="Nơi thường trú" extra={<Button size="small" onClick={sameAsCurrent}>Giống chỗ ở hiện nay</Button>}>
                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Item name="permanentAddress" label="Số nhà, đường phố, thôn/xóm">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="permanentWard" label="Phường, xã, đặc khu">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="permanentProvince" label="Tỉnh, thành phố">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                </>
              ),
            },
            {
              key: 'family',
              label: 'Gia đình',
              forceRender: true,
              children: (
                <Form.List name="guardians">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name }) => (
                        <Card
                          key={key}
                          size="small"
                          style={{ marginBottom: 8 }}
                          title={
                            <Form.Item name={[name, 'isPrimary']} valuePropName="checked" noStyle>
                              <Checkbox>Liên hệ chính</Checkbox>
                            </Form.Item>
                          }
                          extra={<MinusCircleOutlined onClick={() => remove(name)} aria-label="Bỏ" />}
                        >
                          <Form.Item name={[name, 'id']} hidden>
                            <Input />
                          </Form.Item>
                          <Row gutter={12}>
                            <Col xs={24} sm={10}>
                              <Form.Item name={[name, 'fullName']} label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col xs={12} sm={7}>
                              <Form.Item name={[name, 'relationship']} label="Quan hệ" rules={[{ required: true, message: 'Chọn quan hệ' }]}>
                                <Select options={options(RELATIONSHIP)} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} sm={7}>
                              <Form.Item name={[name, 'phone']} label="Điện thoại" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col xs={12} sm={5}>
                              <Form.Item name={[name, 'birthYear']} label="Năm sinh">
                                <InputNumber min={1900} max={2100} controls={false} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} sm={7}>
                              <Form.Item name={[name, 'occupation']} label="Nghề nghiệp">
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col xs={12} sm={6}>
                              <Form.Item name={[name, 'idNumber']} label="Số CCCD" rules={[{ pattern: /^\d{12}$/, message: '12 chữ số' }]}>
                                <Input maxLength={12} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} sm={6}>
                              <Form.Item name={[name, 'email']} label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
                                <Input />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Card>
                      ))}
                      <Button type="dashed" block onClick={() => add({ relationship: 'FATHER' })} icon={<PlusOutlined />}>
                        Thêm cha, mẹ hoặc người giám hộ
                      </Button>
                    </>
                  )}
                </Form.List>
              ),
            },
            ...(editing
              ? []
              : [
                  {
                    key: 'entry',
                    label: 'Nhập trường',
                    forceRender: true,
                    children: (
                      <>
                        <Form.Item name="entryKind" label="Hình thức vào trường" extra="Được ghi vào sổ đăng bộ và danh sách biến động học sinh">
                          <Radio.Group
                            options={[
                              { value: 'ENROLLED', label: 'Tuyển mới' },
                              { value: 'TRANSFER_IN', label: 'Chuyển đến từ trường khác' },
                              { value: '', label: 'Không ghi nhận' },
                            ]}
                          />
                        </Form.Item>
                        {!!entryKind && (
                          <Row gutter={12}>
                            <Col xs={24} sm={8}>
                              <Form.Item name="entryDate" label="Ngày vào trường">
                                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            {entryKind === 'TRANSFER_IN' && (
                              <Col xs={24} sm={16}>
                                <Form.Item name="previousSchool" label="Chuyển đến từ trường" rules={[{ required: true, message: 'Nhập trường cũ của học sinh' }]}>
                                  <Input placeholder="Trường THCS ..., phường/xã ..., tỉnh/thành phố ..." />
                                </Form.Item>
                              </Col>
                            )}
                          </Row>
                        )}
                      </>
                    ),
                  },
                ]),
          ]}
        />
      </Form>
    </Modal>
  );
}
