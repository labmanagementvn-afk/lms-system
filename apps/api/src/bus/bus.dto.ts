import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BoardingType, BusDirection, BusStaffRole, VehicleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { HHMM, YMD } from './bus-rules';

const DATE_MSG = 'Ngày phải có dạng YYYY-MM-DD';
const TIME_MSG = 'Giờ phải có dạng HH:mm';

// ---- Fleet ----

export class VehicleDto {
  @ApiProperty({ example: '29B-123.45' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plateNumber: string;

  @ApiPropertyOptional({ example: 'Ford Transit 16 chỗ' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @ApiProperty({ example: 16, description: 'Số chỗ ngồi' })
  @IsInt()
  @Min(1)
  @Max(100)
  capacity: number;

  @ApiPropertyOptional({ example: '2027-03-31', description: 'Hạn đăng kiểm' })
  @IsOptional()
  @Matches(YMD, { message: DATE_MSG })
  inspectionExpiry?: string | null;

  @ApiPropertyOptional({ example: '2027-01-15', description: 'Hạn bảo hiểm' })
  @IsOptional()
  @Matches(YMD, { message: DATE_MSG })
  insuranceExpiry?: string | null;

  @ApiPropertyOptional({ enum: VehicleStatus })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateVehicleDto extends PartialType(VehicleDto) {}

export class BusStaffDto {
  @ApiProperty({ example: 'Nguyễn Văn Tài' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: '0912000001' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ enum: BusStaffRole })
  @IsEnum(BusStaffRole)
  role: BusStaffRole;

  @ApiPropertyOptional({ example: '010123456789', description: 'Số giấy phép lái xe' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNumber?: string | null;

  @ApiPropertyOptional({ example: '2028-06-30' })
  @IsOptional()
  @Matches(YMD, { message: DATE_MSG })
  licenseExpiry?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBusStaffDto extends PartialType(BusStaffDto) {}

// ---- Routes ----

export class RouteDto {
  @ApiProperty({ example: 'Tuyến 1 - Cầu Giấy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: BusDirection })
  @IsEnum(BusDirection)
  direction: BusDirection;

  @ApiProperty({ example: '06:15', description: 'Giờ xuất phát (giờ địa phương)' })
  @Matches(HHMM, { message: TIME_MSG })
  startTime: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  vehicleId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  driverId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  monitorId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRouteDto extends PartialType(RouteDto) {}

export class StopDto {
  @ApiPropertyOptional({ description: 'Id of an existing stop to keep (its assignments survive)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Ngã tư Cầu Giấy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: '304 Cầu Giấy, Hà Nội' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiProperty({ example: 21.0305 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 105.8012 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: '06:20' })
  @IsOptional()
  @Matches(HHMM, { message: TIME_MSG })
  plannedTime?: string | null;
}

export class ReplaceStopsDto {
  @ApiProperty({ type: [StopDto], description: 'The whole stop list, in order' })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  stops: StopDto[];
}

export class AssignmentItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  stopId: string;
}

export class ReplaceAssignmentsDto {
  @ApiProperty({ type: [AssignmentItemDto], description: "The route's whole roster for the current academic year" })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  items: AssignmentItemDto[];
}

// ---- Trips ----

export class DateQuery {
  @ApiPropertyOptional({ example: '2026-10-05', description: 'School-local date; defaults to today' })
  @IsOptional()
  @Matches(YMD, { message: DATE_MSG })
  date?: string;
}

export class LocationDto {
  @ApiProperty({ example: 21.0305 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 105.8012 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ description: 'm/s' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number | null;

  @ApiPropertyOptional({ description: 'Degrees clockwise from north' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number | null;
}

export class BoardingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ enum: BoardingType })
  @IsEnum(BoardingType)
  type: BoardingType;

  @ApiPropertyOptional({ description: "Defaults to the student's assigned stop at the roadside end of the trip" })
  @IsOptional()
  @IsString()
  stopId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
