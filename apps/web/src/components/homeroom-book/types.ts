// Shape of GET /homeroom/book: the sổ chủ nhiệm of one class.

export interface StudentRef {
  id: string;
  code: string;
  fullName: string;
}

export interface Guardian {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  occupation: string | null;
  isPrimary: boolean;
}

export interface Result {
  academic: string | null;
  conduct: string | null;
  title: string | null;
}

export interface BookStudent extends StudentRef {
  gender: string | null;
  dateOfBirth: string | null;
  ethnicity: string | null;
  religion: string | null;
  residence: string;
  policyGroups: string[];
  youngPioneer: boolean;
  youthUnion: boolean;
  guardians: Guardian[];
  absences: { excused: number; unexcused: number; late: number };
  results: { semester1: Result | null; semester2: Result | null; year: Result | null };
  awards: number;
  disciplines: number;
}

export interface Seating {
  columns: number;
  rows: number;
  seatsPerDesk: number;
  seats: (StudentRef | null)[][];
}

export interface YearPlan {
  situation?: string;
  goals?: string;
  targets?: string;
  measures?: string;
}

export interface MonthPlan {
  id: string;
  month: string;
  theme: string | null;
  tasks: string;
  review: string | null;
}

export interface Meeting {
  id: string;
  date: string;
  title: string;
  attended: number | null;
  invited: number | null;
  content: string;
  opinions: string | null;
  conclusions: string | null;
}

export interface Note {
  id: string;
  date: string;
  kind: string;
  content: string;
  action: string | null;
  result: string | null;
  student: StudentRef;
}

export interface Review {
  id: string;
  date: string;
  content: string;
  author: string;
  mine: boolean;
}

export interface Book {
  class: {
    id: string;
    name: string;
    gradeLevel: number;
    room: string | null;
    academicYear: { id: string; name: string; startDate: string; endDate: string };
    homeroomTeacher: { id: string; code: string; fullName: string; phone: string | null } | null;
  };
  editable: boolean;
  canReview: boolean;
  /** The days the book covers: the school year and the summer after it. */
  span: { from: string; to: string };
  subjectTeachers: { subject: { id: string; code: string; name: string }; semester1: string[]; semester2: string[] }[];
  situation: {
    total: number;
    female: number;
    ethnicMinority: number;
    religion: number;
    youngPioneer: number;
    youthUnion: number;
    policy: { group: string; count: number }[];
    previous: {
      academicYear: { id: string; name: string };
      students: number;
      academic: Record<string, number>;
      conduct: Record<string, number>;
      excellent: number;
      good: number;
    } | null;
  };
  students: BookStudent[];
  officers: { role: string; student: StudentRef }[];
  parentCommittee: { role: string; guardian: { id: string; fullName: string; relationship: string; phone: string }; student: StudentRef }[];
  groups: { name: string; leader: StudentRef | null; students: StudentRef[] }[];
  ungrouped: StudentRef[];
  seating: Seating | null;
  unseated: StudentRef[];
  yearPlan: YearPlan;
  monthPlans: MonthPlan[];
  meetings: Meeting[];
  notes: Note[];
  reviews: Review[];
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Saves part of the book and hands back the whole of it. */
export type SaveBook = (part: Record<string, unknown>, done?: string) => Promise<boolean>;
