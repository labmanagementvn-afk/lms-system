import { Role } from '@prisma/client';

export interface AuthUser {
  userId: string;
  /** Empty string for district officers, who have no school; their routes use districtId instead. */
  schoolId: string;
  districtId: string | null;
  role: Role;
  email: string;
}
