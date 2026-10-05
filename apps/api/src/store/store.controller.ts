import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { CreateItemDto, CreateOrderDto, ItemQuery, OrderQuery, StockChangeDto, UpdateItemDto } from './store.dto';
import { StoreService } from './store.service';

@ApiTags('store')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.STAFF)
@Controller('store')
export class StoreController {
  constructor(private readonly service: StoreService) {}

  @Get('items')
  listItems(@CurrentUser() user: AuthUser, @Query() query: ItemQuery) {
    return this.service.listItems(user.schoolId, query);
  }

  @Post('items')
  createItem(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.service.createItem(user.schoolId, dto);
  }

  @Patch('items/:id')
  updateItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.service.updateItem(user.schoolId, id, dto);
  }

  @Delete('items/:id')
  removeItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeItem(user.schoolId, id);
  }

  @Post('items/:id/stock')
  @HttpCode(200)
  changeStock(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StockChangeDto) {
    return this.service.changeStock(user.schoolId, id, user.userId, dto);
  }

  @Get('items/:id/movements')
  movements(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: PageQuery) {
    return this.service.movements(user.schoolId, id, query);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: AuthUser, @Query() query: OrderQuery) {
    return this.service.listOrders(user.schoolId, query);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getOrder(user.schoolId, id);
  }

  @Post('orders')
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.service.createOrder(user.schoolId, dto);
  }

  @Post('orders/:id/issue')
  @HttpCode(200)
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.issueOrder(user.schoolId, id, user.userId);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelOrder(user.schoolId, id);
  }
}
