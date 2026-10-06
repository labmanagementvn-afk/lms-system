import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth-user';
import { AnyRole, CurrentUser, Public } from '../common/decorators';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Password guessing: AUTH_RATE_LIMIT_PER_MIN attempts per minute per IP (the global limit stays off when RATE_LIMIT_PER_MIN=0).
  @Throttle({ default: { limit: () => Number(process.env.AUTH_RATE_LIMIT_PER_MIN ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @AnyRole()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @ApiBearerAuth()
  @AnyRole()
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }
}
