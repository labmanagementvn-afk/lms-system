'use client';

import { ClearOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Input, InputNumber, Popconfirm, Row, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Book, SaveBook } from './types';

type Group = { name: string; leaderId: string | null; studentIds: string[] };
type Dims = { columns: number; rows: number; seatsPerDesk: number };

/** Light backgrounds that tell the tổ apart on the seating chart. */
const PALETTE = ['#e6f4ff', '#f6ffed', '#fff7e6', '#f9f0ff', '#fff0f6', '#e6fffb', '#fcffe6', '#f0f5ff'];
const emptyGrid = (d: Dims) => Array.from({ length: d.rows }, () => Array<string | null>(d.columns * d.seatsPerDesk).fill(null));

/** Tổ of the class and the seating chart (sơ đồ chỗ ngồi), desk 1 at the board. */
export function BookSeating({ book, save }: { book: Book; save: SaveBook }) {
  const editable = book.editable;
  const [groups, setGroups] = useState<Group[]>([]);
  const [split, setSplit] = useState(4);
  const [dims, setDims] = useState<Dims>({ columns: 4, rows: 3, seatsPerDesk: 2 });
  const [seats, setSeats] = useState<(string | null)[][]>([]);

  useEffect(() => {
    setGroups(book.groups.map((g) => ({ name: g.name, leaderId: g.leader?.id ?? null, studentIds: g.students.map((s) => s.id) })));
    if (book.seating) {
      setDims({ columns: book.seating.columns, rows: book.seating.rows, seatsPerDesk: book.seating.seatsPerDesk });
      setSeats(book.seating.seats.map((row) => row.map((s) => s?.id ?? null)));
    } else {
      const d = { columns: 4, rows: Math.max(1, Math.ceil(book.students.length / 8)), seatsPerDesk: 2 };
      setDims(d);
      setSeats(emptyGrid(d));
    }
  }, [book]);

  const nameOf = useMemo(() => new Map(book.students.map((s) => [s.id, s.fullName])), [book]);
  const groupOf = useMemo(() => {
    const m = new Map<string, number>();
    groups.forEach((g, i) => g.studentIds.forEach((id) => m.set(id, i)));
    return m;
  }, [groups]);
  const seated = useMemo(() => new Set(seats.flat().filter(Boolean) as string[]), [seats]);
  const ungrouped = book.students.filter((s) => !groupOf.has(s.id));
  const unseated = book.students.filter((s) => !seated.has(s.id));

  // ---- tổ ----

  const setGroup = (i: number, patch: Partial<Group>) => setGroups(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  function autoSplit() {
    const next: Group[] = Array.from({ length: split }, (_, i) => ({ name: `Tổ ${i + 1}`, leaderId: null, studentIds: [] }));
    book.students.forEach((s, i) => next[i % split].studentIds.push(s.id));
    setGroups(next);
  }

  // ---- sơ đồ chỗ ngồi ----

  /** A new grid size, keeping every student whose desk and seat still exist. */
  function resize(next: Dims) {
    setSeats(
      Array.from({ length: next.rows }, (_, r) =>
        Array.from({ length: next.columns * next.seatsPerDesk }, (_, i) => {
          const col = Math.floor(i / next.seatsPerDesk);
          const seat = i % next.seatsPerDesk;
          return r < dims.rows && col < dims.columns && seat < dims.seatsPerDesk ? (seats[r]?.[col * dims.seatsPerDesk + seat] ?? null) : null;
        }),
      ),
    );
    setDims(next);
  }

  /** Seats a student, moving them from any other seat. */
  function sit(r: number, i: number, id: string | null) {
    setSeats(seats.map((row, rr) => row.map((s, ii) => (rr === r && ii === i ? id : id && s === id ? null : s))));
  }

  /** Fills the chart: in roster order desk by desk, or tổ by tổ down each dãy. */
  function arrange(by: 'list' | 'group') {
    const grid = emptyGrid(dims);
    const order = by === 'list' ? book.students.map((s) => s.id) : [...groups.flatMap((g) => g.studentIds), ...ungrouped.map((s) => s.id)];
    let k = 0;
    if (by === 'list') {
      for (let r = 0; r < dims.rows; r++) for (let i = 0; i < dims.columns * dims.seatsPerDesk; i++) grid[r][i] = order[k++] ?? null;
    } else {
      for (let c = 0; c < dims.columns; c++) for (let r = 0; r < dims.rows; r++) for (let s = 0; s < dims.seatsPerDesk; s++) grid[r][c * dims.seatsPerDesk + s] = order[k++] ?? null;
    }
    setSeats(grid);
  }

  const studentOptions = book.students.map((s) => ({ value: s.id, label: s.fullName }));
  // Wide enough for a full name when the class has few seats across; the chart scrolls sideways when it has many.
  const seatWidth = Math.max(120, Math.min(176, Math.floor(960 / (dims.columns * dims.seatsPerDesk))));

  return (
    <>
      <Card
        size="small"
        title="Tổ"
        style={{ marginBottom: 16 }}
        extra={
          editable && (
            <Space wrap>
              <Space.Compact>
                <InputNumber min={1} max={12} value={split} onChange={(v) => setSplit(v ?? 4)} style={{ width: 64 }} aria-label="Số tổ" />
                <Popconfirm title={`Chia lớp thành ${split} tổ?`} description="Các tổ hiện có sẽ được thay." onConfirm={autoSplit}>
                  <Button icon={<TeamOutlined />}>Chia tổ tự động</Button>
                </Popconfirm>
              </Space.Compact>
              <Button icon={<PlusOutlined />} onClick={() => setGroups([...groups, { name: `Tổ ${groups.length + 1}`, leaderId: null, studentIds: [] }])} disabled={groups.length >= 12}>
                Thêm tổ
              </Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={() => save({ groups }, 'Đã lưu các tổ')}>
                Lưu các tổ
              </Button>
            </Space>
          )
        }
      >
        {!groups.length && <Typography.Text type="secondary">Lớp chưa chia tổ.</Typography.Text>}
        <Row gutter={[12, 12]}>
          {groups.map((g, i) => (
            <Col key={i} xs={24} md={12} xl={6}>
              <Card
                size="small"
                style={{ background: PALETTE[i % PALETTE.length], height: '100%' }}
                title={editable ? <Input value={g.name} maxLength={40} onChange={(e) => setGroup(i, { name: e.target.value })} variant="borderless" style={{ fontWeight: 600, paddingInline: 0 }} aria-label="Tên tổ" /> : g.name}
                extra={editable && <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setGroups(groups.filter((_, j) => j !== i))} aria-label="Xóa tổ" />}
              >
                {editable ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Select
                      placeholder="Tổ trưởng"
                      allowClear
                      value={g.leaderId ?? undefined}
                      onChange={(v) => setGroup(i, { leaderId: v ?? null })}
                      options={g.studentIds.map((id) => ({ value: id, label: nameOf.get(id) }))}
                      style={{ width: '100%' }}
                    />
                    <Select
                      mode="multiple"
                      placeholder="Thành viên"
                      value={g.studentIds}
                      optionFilterProp="label"
                      onChange={(ids: string[]) => setGroup(i, { studentIds: ids, leaderId: g.leaderId && ids.includes(g.leaderId) ? g.leaderId : null })}
                      options={book.students.map((s) => ({ value: s.id, label: s.fullName, disabled: groupOf.has(s.id) && groupOf.get(s.id) !== i }))}
                      style={{ width: '100%' }}
                    />
                  </Space>
                ) : (
                  <>
                    <div>
                      Tổ trưởng: <b>{g.leaderId ? nameOf.get(g.leaderId) : 'chưa chọn'}</b>
                    </div>
                    <div>{g.studentIds.map((id) => nameOf.get(id)).join(', ')}</div>
                  </>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {g.studentIds.length} học sinh
                </Typography.Text>
              </Card>
            </Col>
          ))}
        </Row>
        {groups.length > 0 && ungrouped.length > 0 && (
          <Alert type="warning" showIcon style={{ marginTop: 12 }} message={`Chưa vào tổ: ${ungrouped.map((s) => s.fullName).join(', ')}`} />
        )}
      </Card>

      <Card
        size="small"
        title="Sơ đồ chỗ ngồi"
        extra={
          editable && (
            <Space wrap>
              <Button onClick={() => arrange('list')}>Xếp theo danh sách</Button>
              <Button onClick={() => arrange('group')} disabled={!groups.length}>
                Xếp theo tổ
              </Button>
              <Button icon={<ClearOutlined />} onClick={() => setSeats(emptyGrid(dims))}>
                Để trống
              </Button>
              {book.seating && (
                <Popconfirm title="Xóa sơ đồ chỗ ngồi đã lưu?" onConfirm={() => save({ seating: null }, 'Đã xóa sơ đồ chỗ ngồi')}>
                  <Button danger>Xóa sơ đồ</Button>
                </Popconfirm>
              )}
              <Button type="primary" icon={<SaveOutlined />} onClick={() => save({ seating: { ...dims, seats } }, 'Đã lưu sơ đồ chỗ ngồi')}>
                Lưu sơ đồ
              </Button>
            </Space>
          )
        }
      >
        {editable && (
          <Space wrap style={{ marginBottom: 12 }}>
            <span>Số dãy</span>
            <InputNumber min={1} max={6} value={dims.columns} onChange={(v) => v && resize({ ...dims, columns: v })} style={{ width: 64 }} />
            <span>Số bàn mỗi dãy</span>
            <InputNumber min={1} max={12} value={dims.rows} onChange={(v) => v && resize({ ...dims, rows: v })} style={{ width: 64 }} />
            <span>Chỗ mỗi bàn</span>
            <InputNumber min={1} max={4} value={dims.seatsPerDesk} onChange={(v) => v && resize({ ...dims, seatsPerDesk: v })} style={{ width: 64 }} />
            <Typography.Text type="secondary">
              {dims.rows * dims.columns * dims.seatsPerDesk} chỗ cho {book.students.length} học sinh
            </Typography.Text>
          </Space>
        )}
        {!editable && !book.seating ? (
          <Typography.Text type="secondary">Lớp chưa có sơ đồ chỗ ngồi.</Typography.Text>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 68 + dims.columns * (dims.seatsPerDesk * (seatWidth + 4) + 34) }}>
              <div style={{ textAlign: 'center', background: '#334155', color: '#fff', borderRadius: 4, padding: 6, marginBottom: 12, letterSpacing: 4 }}>BẢNG</div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 6, paddingLeft: 68 }}>
                {Array.from({ length: dims.columns }, (_, c) => (
                  <div key={c} style={{ width: dims.seatsPerDesk * (seatWidth + 4) + 10, textAlign: 'center', fontWeight: 600 }}>
                    Dãy {c + 1}
                  </div>
                ))}
              </div>
              {seats.map((row, r) => (
                <div key={r} style={{ display: 'flex', gap: 24, marginBottom: 8, alignItems: 'center' }}>
                  <div style={{ width: 44, textAlign: 'right', color: '#64748b', whiteSpace: 'nowrap' }}>Bàn {r + 1}</div>
                  {Array.from({ length: dims.columns }, (_, c) => (
                    <div key={c} style={{ display: 'flex', gap: 4, border: '1px solid #cbd5e1', borderRadius: 6, padding: 4, background: '#f8fafc' }}>
                      {Array.from({ length: dims.seatsPerDesk }, (_, k) => {
                        const i = c * dims.seatsPerDesk + k;
                        const id = row[i];
                        const g = id ? groupOf.get(id) : undefined;
                        const bg = g === undefined ? '#fff' : PALETTE[g % PALETTE.length];
                        return editable ? (
                          <Select
                            key={k}
                            size="small"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Trống"
                            value={id ?? undefined}
                            onChange={(v) => sit(r, i, v ?? null)}
                            options={studentOptions}
                            style={{ width: seatWidth, background: bg, borderRadius: 4 }}
                            variant="borderless"
                            aria-label={`Bàn ${r + 1}, dãy ${c + 1}, chỗ ${k + 1}`}
                          />
                        ) : (
                          <div key={k} style={{ width: seatWidth, minHeight: 24, padding: '2px 6px', background: bg, borderRadius: 4, fontSize: 13 }}>
                            {id ? nameOf.get(id) : <Typography.Text type="secondary">Trống</Typography.Text>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {unseated.length > 0 && (editable || book.seating) && (
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">Chưa xếp chỗ: </Typography.Text>
            {unseated.map((s) => (
              <Tag key={s.id}>{s.fullName}</Tag>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
