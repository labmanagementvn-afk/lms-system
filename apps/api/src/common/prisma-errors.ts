import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Turns unique-constraint and missing-record errors into HTTP errors with a readable message. */
export function rethrowPrismaError(err: unknown, conflictMessage: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new ConflictException(conflictMessage);
    if (err.code === 'P2025') throw new NotFoundException();
  }
  throw err;
}
