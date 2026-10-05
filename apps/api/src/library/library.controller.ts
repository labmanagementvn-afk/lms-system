import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Roles } from '../common/decorators';
import { CatalogService } from './catalog.service';
import { CirculationService } from './circulation.service';
import { AddCopiesDto, BookDto, BookQuery, BorrowDto, LoanQuery, ReservationDto, ReservationQuery, ReturnDto, UpdateBookDto, UpdateCopyDto } from './library.dto';

@ApiTags('library')
@ApiBearerAuth()
@Controller('library')
export class LibraryController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly circulation: CirculationService,
  ) {}

  @Get('books')
  listBooks(@CurrentUser() user: AuthUser, @Query() query: BookQuery) {
    return this.catalog.listBooks(user.schoolId, query);
  }

  @Get('categories')
  categories(@CurrentUser() user: AuthUser) {
    return this.catalog.categories(user.schoolId);
  }

  @Get('books/:id')
  getBook(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalog.getBook(user.schoolId, id);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('books')
  createBook(@CurrentUser() user: AuthUser, @Body() dto: BookDto) {
    return this.catalog.createBook(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Patch('books/:id')
  updateBook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookDto) {
    return this.catalog.updateBook(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Delete('books/:id')
  removeBook(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalog.removeBook(user.schoolId, id);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('books/:id/copies')
  addCopies(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddCopiesDto) {
    return this.catalog.addCopies(user.schoolId, id, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Patch('copies/:id')
  updateCopy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCopyDto) {
    return this.catalog.updateCopy(user.schoolId, id, dto);
  }

  @Get('copies/by-barcode/:barcode')
  byBarcode(@CurrentUser() user: AuthUser, @Param('barcode') barcode: string) {
    return this.catalog.byBarcode(user.schoolId, barcode);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('loans')
  listLoans(@CurrentUser() user: AuthUser, @Query() query: LoanQuery) {
    return this.circulation.listLoans(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('loans')
  borrow(@CurrentUser() user: AuthUser, @Body() dto: BorrowDto) {
    return this.circulation.borrow(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(200)
  @Post('loans/:id/renew')
  renew(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.circulation.renew(user.schoolId, id);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(200)
  @Post('returns')
  return(@CurrentUser() user: AuthUser, @Body() dto: ReturnDto) {
    return this.circulation.return(user.schoolId, dto.barcode);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Get('reservations')
  listReservations(@CurrentUser() user: AuthUser, @Query() query: ReservationQuery) {
    return this.circulation.listReservations(user.schoolId, query);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @Post('reservations')
  reserve(@CurrentUser() user: AuthUser, @Body() dto: ReservationDto) {
    return this.circulation.reserve(user.schoolId, dto);
  }

  @Roles(Role.ADMIN, Role.STAFF)
  @HttpCode(200)
  @Post('reservations/:id/cancel')
  cancelReservation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.circulation.cancelReservation(user.schoolId, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.catalog.stats(user.schoolId);
  }
}
