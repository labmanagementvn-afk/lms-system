/** Shapes of the end-of-year review API (/grades/review and /grades/completion). */

export interface ClassRef {
  id: string;
  name: string;
  gradeLevel: number;
}

/** Which students a review list covers: a class, a grade level or the whole school (also a report query). */
export type Scope = {
  classId?: string;
  gradeLevel?: number;
};

interface SubjectRef {
  subjectId: string;
  code: string;
  name: string;
  assessment: 'SCORE' | 'COMMENT';
}

export interface Retake extends SubjectRef {
  id: string;
  yearAverage: number | null;
  yearPassed: boolean | null;
  score: number | null;
  passed: boolean | null;
  note: string | null;
  entered: boolean;
}

export interface RetakeStudent {
  id: string;
  code: string;
  fullName: string;
  class: ClassRef;
  academic: string | null;
  conduct: string | null;
  absentDays: number;
  academicAfterRetake: string | null;
  promotion: string | null;
  promotionSetByHand: boolean;
  /** PROMOTION: learning failed (Điều 14); COMPLETION: a grade 9 subject at Chưa đạt. */
  reason: 'PROMOTION' | 'COMPLETION' | null;
  eligible: (SubjectRef & { average: number | null; passed: boolean | null })[];
  retakes: Retake[];
}

export interface RetakeList {
  academicYear: { id: string; name: string };
  students: RetakeStudent[];
  summary: { students: number; unregistered: number; subjects: number; entered: number; promoted: number; retained: number };
}

export interface TrainingStudent {
  id: string;
  code: string;
  fullName: string;
  class: ClassRef;
  homeroomTeacherId: string | null;
  academic: string | null;
  conduct: string | null;
  absentDays: number;
  conductAfterTraining: string | null;
  promotion: string | null;
  promotionSetByHand: boolean;
  /** False when learning failed too or absences went over 45: the re-evaluation does not change promotion. */
  decides: boolean;
  training: { id: string; tasks: string; result: string | null; comment: string | null; assignedAt: string; evaluatedAt: string | null } | null;
}

export interface TrainingList {
  academicYear: { id: string; name: string };
  students: TrainingStudent[];
  summary: { students: number; assigned: number; evaluated: number; promoted: number; retained: number };
}

export interface PromotionOverview {
  academicYear: { id: string; name: string };
  classes: (ClassRef & { students: number; promoted: number; afterReview: number; retest: number; retained: number; pending: number })[];
  students: {
    id: string;
    code: string;
    fullName: string;
    class: ClassRef;
    academic: string | null;
    conduct: string | null;
    absentDays: number;
    academicAfterRetake: string | null;
    conductAfterTraining: string | null;
    promotion: string;
    review: 'RETAKE' | 'TRAINING' | null;
    promotionSetByHand: boolean;
    reason: string;
  }[];
}

export interface CouncilMember {
  name: string;
  position?: string;
  role: string;
}

export interface CompletionStudent {
  id: string;
  code: string;
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  class: { id: string; name: string };
  academic: string | null;
  conduct: string | null;
  absentDays: number;
  failedSubjects: string[];
  age: number | null;
  dossierComplete: boolean;
  priority: string | null;
  note: string | null;
  gaps: string[];
  eligible: boolean;
  recognized: { round: number; decisionNo: string | null; decidedOn: string | null; registerNo: number | null } | null;
}

export interface CompletionOverview {
  academicYear: { id: string; name: string; reviewYear: number };
  round: {
    round: number;
    saved: boolean;
    councilDecisionNo: string | null;
    councilDecidedOn: string | null;
    meetingAt: string | null;
    meetingPlace: string | null;
    members: CouncilMember[];
    decisionNo: string | null;
    decidedOn: string | null;
    signerTitle: string | null;
    signerName: string | null;
    recognizedAt: string | null;
  };
  rounds: { round: number; decisionNo: string | null; decidedOn: string | null; recognizedAt: string | null; recognized: number }[];
  students: CompletionStudent[];
  summary: { students: number; eligible: number; notEligible: number; recognized: number };
}

/** 05/03/2012 from an ISO date. */
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** File names of downloaded documents: ASCII, dashes. */
export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^0-9A-Za-z]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
