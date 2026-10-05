import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Maps Prisma errors that escape services to HTTP responses instead of 500s. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2025: [HttpStatus.NOT_FOUND, 'Không tìm thấy dữ liệu'],
      P2002: [HttpStatus.CONFLICT, 'Dữ liệu bị trùng'],
      P2003: [HttpStatus.CONFLICT, 'Dữ liệu đang được sử dụng ở nơi khác'],
    };
    const [statusCode, message] = map[err.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Lỗi cơ sở dữ liệu'];
    res.status(statusCode).json({ statusCode, message });
  }
}
