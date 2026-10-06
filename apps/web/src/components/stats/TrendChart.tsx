'use client';

import { Table, Typography } from 'antd';
import { useCallback, useMemo, useRef, useState } from 'react';

export interface TrendPoint {
  /** YYYY-MM-DD */
  date: string;
  [key: string]: number | string | null | undefined;
}

export interface TrendSeries {
  key: string;
  label: string;
  /** Formats a value for the tooltip, table and direct label. */
  format?: (v: number) => string;
}

/** Categorical slots in validated order (blue, orange, aqua, yellow); never cycled past four. */
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#ffffff' };
const M = { top: 14, right: 16, bottom: 24, left: 40 };

/** "05/10" from "2026-10-05". */
const dm = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7);
/** "05/10/2026" */
const dmy = (date: string) => date.split('-').reverse().join('/');
const fmtDefault = (v: number) => v.toLocaleString('vi-VN');

/**
 * Width of the chart container, tracked with a ResizeObserver. A callback ref (not an effect
 * with empty deps) so the observer attaches whenever the container mounts, which happens only
 * after data arrives.
 */
function useWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    observer.current = ro;
    setWidth(el.clientWidth);
  }, []);
  return [ref, width] as const;
}

/** A "nice" axis ceiling (1, 2, 5 × 10^n) at or above the data maximum. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= max) return f * p;
  return 10 * p;
}

/** Path of a column with a 4px rounded top and a square base. */
function column(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Daily trend over a window: one series as a line with an area wash, several as grouped
 * columns. Hover shows a tooltip for the day; a table view is one click away.
 */
export function TrendChart({
  data,
  series,
  kind = 'line',
  max,
  unit = '',
  height = 220,
  showTable = true,
}: {
  data: TrendPoint[];
  series: TrendSeries[];
  kind?: 'line' | 'columns';
  /** Fixed axis top (100 for percentages); otherwise a nice ceiling of the data. */
  max?: number;
  unit?: string;
  height?: number;
  showTable?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const plotH = height - M.top - M.bottom;
  const n = data.length;
  const value = (i: number, s: TrendSeries): number | null => {
    const v = data[i]?.[s.key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const top = useMemo(() => max ?? niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => (typeof d[s.key] === 'number' ? (d[s.key] as number) : 0))))), [data, series, max]);
  const ticks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((t) => t * top), [top]);
  // The left gutter grows with the longest tick label (about 6.6px per character at 11px).
  const left = Math.max(M.left, Math.ceil(Math.max(...ticks.map((t) => fmtDefault(t).length)) * 6.6) + 12);
  const plotW = Math.max(0, width - left - M.right);
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const slot = plotW / Math.max(n, 1);
  const xc = (i: number) => left + slot * (i + 0.5);
  // One date label every k points so labels never collide (about 44px each).
  const every = Math.max(1, Math.ceil((n * 44) / Math.max(plotW, 1)));

  if (!n) return <Typography.Text type="secondary">Chưa có dữ liệu.</Typography.Text>;

  const lastIdx = (() => {
    for (let i = n - 1; i >= 0; i--) if (value(i, series[0]) !== null) return i;
    return -1;
  })();

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor((e.clientX - rect.left) / Math.max(slot, 1))));
    setHover(i);
  };

  const tooltip =
    hover !== null && data[hover] ? (
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: Math.min(Math.max(xc(hover) - 70, 0), Math.max(width - 150, 0)),
          background: INK.surface,
          border: `1px solid ${INK.grid}`,
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
          boxShadow: '0 2px 8px rgba(11,11,11,0.08)',
          pointerEvents: 'none',
          minWidth: 140,
          color: INK.primary,
        }}
      >
        <div style={{ color: INK.secondary, marginBottom: 2 }}>{dmy(data[hover].date)}</div>
        {series.map((s, si) => {
          const v = value(hover, s);
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: SLOTS[si], display: 'inline-block' }} />
              <span style={{ color: INK.secondary, flex: 1 }}>{s.label}</span>
              <b>{v === null ? '—' : `${(s.format ?? fmtDefault)(v)}${unit}`}</b>
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <div className="trend-chart">
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: INK.secondary, marginBottom: 4 }}>
          {series.map((s, si) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: kind === 'line' ? 5 : 2, background: SLOTS[si], display: 'inline-block' }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} style={{ display: 'block', fontFamily: 'inherit' }} role="img" aria-label={series.map((s) => s.label).join(', ')}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={left - 6} y={y(t) + 4} fontSize={11} fill={INK.muted} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDefault(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              // The last day is always labelled; the regular label just before it is dropped when it would collide.
              i === n - 1 || (i % every === 0 && n - 1 - i >= every) ? (
                <text key={d.date} x={xc(i)} y={height - 6} fontSize={11} fill={INK.muted} textAnchor="middle">
                  {dm(d.date)}
                </text>
              ) : null,
            )}
            {kind === 'line' &&
              series.map((s, si) => {
                // Break the line where a day has no value.
                const segments: string[] = [];
                let cur: string[] = [];
                data.forEach((_, i) => {
                  const v = value(i, s);
                  if (v === null) {
                    if (cur.length) segments.push(cur.join(' '));
                    cur = [];
                  } else cur.push(`${cur.length ? 'L' : 'M'}${xc(i)},${y(v)}`);
                });
                if (cur.length) segments.push(cur.join(' '));
                const area = si === 0 && segments.length === 1 ? `${segments[0]} L${xc(lastIdx)},${y(0)} L${xc(data.findIndex((_, i) => value(i, s) !== null))},${y(0)} Z` : null;
                return (
                  <g key={s.key}>
                    {area && <path d={area} fill={SLOTS[si]} fillOpacity={0.1} />}
                    {segments.map((seg, k) => (
                      <path key={k} d={seg} fill="none" stroke={SLOTS[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                  </g>
                );
              })}
            {kind === 'columns' &&
              data.map((_, i) => {
                const groupW = Math.min(slot - 6, series.length * 24 + (series.length - 1) * 2);
                const barW = (groupW - (series.length - 1) * 2) / series.length;
                const x0 = xc(i) - groupW / 2;
                return series.map((s, si) => {
                  const v = value(i, s);
                  if (v === null || v <= 0) return null;
                  return <path key={s.key} d={column(x0 + si * (barW + 2), y(v), barW, y(0) - y(v))} fill={SLOTS[si]} />;
                });
              })}
            {hover !== null && kind === 'line' && <line x1={xc(hover)} x2={xc(hover)} y1={M.top} y2={y(0)} stroke={INK.axis} strokeWidth={1} shapeRendering="crispEdges" />}
            {kind === 'line' &&
              series.map((s, si) =>
                [lastIdx, hover].map((i) =>
                  i !== null && i >= 0 && value(i, s) !== null ? (
                    <circle key={`${s.key}-${i}`} cx={xc(i)} cy={y(value(i, s)!)} r={4} fill={SLOTS[si]} stroke={INK.surface} strokeWidth={2} />
                  ) : null,
                ),
              )}
            {kind === 'line' && lastIdx >= 0 && hover === null && (
              <text x={xc(lastIdx) + (lastIdx === n - 1 ? -8 : 8)} y={y(value(lastIdx, series[0])!) - 8} fontSize={12} fontWeight={600} fill={INK.primary} textAnchor={lastIdx === n - 1 ? 'end' : 'start'}>
                {(series[0].format ?? fmtDefault)(value(lastIdx, series[0])!)}
                {unit}
              </text>
            )}
            <rect x={left} y={M.top} width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} />
          </svg>
        )}
        {tooltip}
      </div>
      {showTable && (
        <div style={{ textAlign: 'right' }}>
          <Typography.Link style={{ fontSize: 12 }} onClick={() => setTable((t) => !t)}>
            {table ? 'Ẩn bảng' : 'Xem bảng'}
          </Typography.Link>
        </div>
      )}
      {table && (
        <Table<TrendPoint>
          size="small"
          rowKey="date"
          pagination={false}
          dataSource={data}
          style={{ marginTop: 8 }}
          columns={[
            { title: 'Ngày', dataIndex: 'date', render: (d: string) => dmy(d) },
            ...series.map((s) => ({ title: s.label, dataIndex: s.key, align: 'right' as const, render: (v: unknown) => (typeof v === 'number' ? `${(s.format ?? fmtDefault)(v)}${unit}` : '—') })),
          ]}
        />
      )}
    </div>
  );
}
