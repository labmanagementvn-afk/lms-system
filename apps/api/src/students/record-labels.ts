// Labels of the student record, as the sổ đăng bộ and the reports print them.
import { MovementKind, PolicyGroup } from '@prisma/client';

export const POLICY_LABEL: Record<PolicyGroup, string> = {
  MARTYR_CHILD: 'Con liệt sĩ',
  WAR_INVALID_CHILD: 'Con thương binh, bệnh binh',
  POOR_HOUSEHOLD: 'Hộ nghèo',
  NEAR_POOR_HOUSEHOLD: 'Hộ cận nghèo',
  HARDSHIP_AREA: 'Vùng đặc biệt khó khăn',
  DISABILITY: 'Khuyết tật',
  ORPHAN: 'Mồ côi',
};

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  ENROLLED: 'Tuyển mới',
  TRANSFER_IN: 'Chuyển đến',
  CLASS_CHANGE: 'Chuyển lớp',
  TRANSFER_OUT: 'Chuyển đi',
  DROPPED: 'Thôi học',
  RETURNED: 'Trở lại học',
};

/** Chỗ ở hiện nay: house and street, then ward and province (two-level local government since 2025). */
export const residence = (s: { address: string | null; currentWard: string | null; currentProvince: string | null }) => [s.address, s.currentWard, s.currentProvince].filter(Boolean).join(', ');
