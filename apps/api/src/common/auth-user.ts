import { Role } from '@prisma/client';

export interface AuthUser {
  userId: string;
  schoolId: string;
  role: Role;
  email: string;
}
