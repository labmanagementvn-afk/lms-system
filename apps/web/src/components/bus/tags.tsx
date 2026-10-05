'use client';

import { Tag } from 'antd';
import { BUS_DIRECTION, BUS_TRIP_STATUS } from '@/lib/labels';

/** Where a student is on a trip, derived from their boarding events. */
export const BOARDING_STATE: Record<string, { label: string; color: string }> = {
  NOT_BOARDED: { label: 'Chưa lên xe', color: 'default' },
  ON_BUS: { label: 'Đang trên xe', color: 'blue' },
  ALIGHTED: { label: 'Đã xuống xe', color: 'green' },
};

export interface TripCounts {
  total: number;
  boarded: number;
  onBus: number;
  alighted: number;
}

export function TripStatusTag({ status }: { status: string }) {
  const s = BUS_TRIP_STATUS[status];
  return <Tag color={s?.color}>{s?.label ?? status}</Tag>;
}

export function DirectionTag({ direction }: { direction: string }) {
  return <Tag color={direction === 'PICKUP' ? 'gold' : 'purple'}>{BUS_DIRECTION[direction] ?? direction}</Tag>;
}

export function StateTag({ state }: { state: string }) {
  const s = BOARDING_STATE[state];
  return <Tag color={s?.color}>{s?.label ?? state}</Tag>;
}

/** "3/10 đã lên xe · 2 trên xe · 1 đã xuống" */
export const countsText = (c: TripCounts) => `${c.boarded}/${c.total} đã lên xe · ${c.onBus} trên xe · ${c.alighted} đã xuống`;
