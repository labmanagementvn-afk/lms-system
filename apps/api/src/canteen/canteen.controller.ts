import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { DailyQuery, MenuDto, MenuQuery, MonthlyQuery, RegistrationDto } from './canteen.dto';
import { CanteenService } from './canteen.service';

@ApiTags('canteen')
@ApiBearerAuth()
@Controller('canteen')
export class CanteenController {
  constructor(private readonly service: CanteenService) {}

  @Get('menus')
  listMenus(@CurrentUser() user: AuthUser, @Query() query: MenuQuery) {
    return this.service.listMenus(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Put('menus')
  upsertMenu(@CurrentUser() user: AuthUser, @Body() dto: MenuDto) {
    return this.service.upsertMenu(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete('menus/:id')
  removeMenu(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeMenu(user.schoolId, id);
  }

  /** Teachers register their class; changes lock at the menu's cutoff except for admins. */
  @Post('registrations')
  @HttpCode(200)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegistrationDto) {
    return this.service.register(user, dto);
  }

  @Get('daily')
  daily(@CurrentUser() user: AuthUser, @Query() query: DailyQuery) {
    return this.service.daily(user.schoolId, query);
  }

  @Get('monthly')
  monthly(@CurrentUser() user: AuthUser, @Query() query: MonthlyQuery) {
    return this.service.monthly(user.schoolId, query);
  }
}
