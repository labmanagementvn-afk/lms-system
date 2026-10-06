import { ConductStatus, ResultLevel } from '@prisma/client';

// Pure rules of the conduct (rèn luyện) workflow: totals, levels, default criteria, status transitions.

/** Minimum final total for each level; anything below DAT is CHUA_DAT. */
export const LEVEL_THRESHOLDS: Record<Exclude<ResultLevel, 'CHUA_DAT'>, number> = { TOT: 90, KHA: 70, DAT: 50 };

export const LEVEL_LABEL: Record<ResultLevel, string> = { TOT: 'Tốt', KHA: 'Khá', DAT: 'Đạt', CHUA_DAT: 'Chưa đạt' };

/** The conduct level a final total earns. */
export function levelFor(total: number): ResultLevel {
  if (total >= LEVEL_THRESHOLDS.TOT) return ResultLevel.TOT;
  if (total >= LEVEL_THRESHOLDS.KHA) return ResultLevel.KHA;
  if (total >= LEVEL_THRESHOLDS.DAT) return ResultLevel.DAT;
  return ResultLevel.CHUA_DAT;
}

export interface CriterionRef {
  id: string;
  maxPoints: number;
  isActive?: boolean;
}

export interface PointItem {
  criterionId: string;
  points: number | null | undefined;
}

/** A rule violation the API turns into a 400. */
export class ConductRuleError extends Error {}

/** Points of the active criteria, i.e. what a perfect assessment adds up to (should be 100). */
export function activePoints(criteria: { maxPoints: number; isActive?: boolean }[]): number {
  return criteria.filter((c) => c.isActive !== false).reduce((sum, c) => sum + c.maxPoints, 0);
}

/** Rejects points for unknown or inactive criteria, negative points and points above the criterion's maximum. */
export function validateItems(items: PointItem[], criteria: CriterionRef[]): void {
  const byId = new Map(criteria.filter((c) => c.isActive !== false).map((c) => [c.id, c]));
  for (const item of items) {
    const c = byId.get(item.criterionId);
    if (!c) throw new ConductRuleError('Tiêu chí không hợp lệ hoặc không còn áp dụng');
    if (item.points == null) continue;
    if (!Number.isInteger(item.points) || item.points < 0) throw new ConductRuleError('Điểm phải là số nguyên không âm');
    if (item.points > c.maxPoints) throw new ConductRuleError(`Điểm vượt quá mức tối đa ${c.maxPoints} của tiêu chí`);
  }
}

/** Σ over active criteria of min(points, maxPoints); a missing item counts 0, negative points are rejected. */
export function computeTotal(items: PointItem[], criteria: CriterionRef[]): number {
  const points = new Map(items.map((i) => [i.criterionId, i.points]));
  let total = 0;
  for (const c of criteria) {
    if (c.isActive === false) continue;
    const p = points.get(c.id);
    if (p == null) continue;
    if (p < 0) throw new ConductRuleError('Điểm phải là số nguyên không âm');
    total += Math.min(p, c.maxPoints);
  }
  return total;
}

// ---- Workflow: DRAFT -> SELF_ASSESSED (student) -> REVIEWED (homeroom teacher) -> APPROVED (leadership) ----

/** Students may change their self-assessment until the teacher reviews it. */
export const canSelfAssess = (status: ConductStatus) => status === ConductStatus.DRAFT || status === ConductStatus.SELF_ASSESSED;
/** The teacher may review (and re-review) anything not yet approved. */
export const canReview = (status: ConductStatus) => status !== ConductStatus.APPROVED;
export const canApprove = (status: ConductStatus) => status === ConductStatus.REVIEWED;
export const canReopen = (status: ConductStatus) => status === ConductStatus.APPROVED;

/** Notification sent to the student and their guardians when a semester assessment is approved. */
export function approvedNotification(semester: number, level: ResultLevel, total: number) {
  return { title: 'Kết quả rèn luyện', body: `Kết quả rèn luyện học kỳ ${semester}: ${LEVEL_LABEL[level]} (${total} điểm)` };
}

export interface DefaultCriterion {
  code: string;
  name: string;
  maxPoints: number;
  groupName: string;
  sortOrder: number;
}

/** Criteria a school starts with (4 groups, 100 points); also used by the seed. */
export const DEFAULT_CRITERIA: DefaultCriterion[] = [
  { code: 'RL01', name: 'Chuyên cần, đi học đúng giờ', maxPoints: 10, groupName: 'Ý thức học tập', sortOrder: 1 },
  { code: 'RL02', name: 'Chuẩn bị bài, làm bài tập đầy đủ', maxPoints: 10, groupName: 'Ý thức học tập', sortOrder: 2 },
  { code: 'RL03', name: 'Tích cực xây dựng bài trên lớp', maxPoints: 10, groupName: 'Ý thức học tập', sortOrder: 3 },
  { code: 'RL04', name: 'Thực hiện nội quy trường lớp, đồng phục', maxPoints: 15, groupName: 'Chấp hành nội quy', sortOrder: 4 },
  { code: 'RL05', name: 'Không vi phạm kỷ luật', maxPoints: 15, groupName: 'Chấp hành nội quy', sortOrder: 5 },
  { code: 'RL06', name: 'Tham gia phong trào, hoạt động Đội', maxPoints: 10, groupName: 'Hoạt động tập thể', sortOrder: 6 },
  { code: 'RL07', name: 'Lao động, vệ sinh trường lớp', maxPoints: 10, groupName: 'Hoạt động tập thể', sortOrder: 7 },
  { code: 'RL08', name: 'Lễ phép với thầy cô, người lớn', maxPoints: 10, groupName: 'Quan hệ, ứng xử', sortOrder: 8 },
  { code: 'RL09', name: 'Đoàn kết, giúp đỡ bạn bè', maxPoints: 10, groupName: 'Quan hệ, ứng xử', sortOrder: 9 },
];
