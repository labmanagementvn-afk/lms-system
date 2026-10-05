import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ItemCategory, StoreOrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  NotEquals,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

export class CreateItemDto {
  @ApiProperty({ example: 'DP-AO-S', description: 'Mã hàng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  sku: string;

  @ApiProperty({ example: 'Áo đồng phục size S' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ enum: ItemCategory })
  @IsEnum(ItemCategory)
  category: ItemCategory;

  @ApiPropertyOptional({ example: 'cái' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({ example: 120000, description: 'Giá bán (VND)' })
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Mã vật tư bên kế toán (MISA)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}

export class ItemQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ItemCategory })
  @IsOptional()
  @IsEnum(ItemCategory)
  category?: ItemCategory;

  @ApiPropertyOptional({ description: 'Only items with stock at or below this quantity' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;
}

export class StockChangeDto {
  @ApiProperty({ enum: ['IN', 'ADJUST'], description: 'IN = nhập kho, ADJUST = điều chỉnh (kiểm kê)' })
  @IsIn(['IN', 'ADJUST'])
  type: 'IN' | 'ADJUST';

  @ApiProperty({ example: 50, description: 'IN: số dương; ADJUST: số có dấu, khác 0' })
  @IsInt()
  @NotEquals(0)
  quantity: number;

  @ApiPropertyOptional({ example: 90000, description: 'Đơn giá nhập (VND)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class OrderLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ type: [OrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines: OrderLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class OrderQuery extends PageQuery {
  @ApiPropertyOptional({ enum: StoreOrderStatus })
  @IsOptional()
  @IsEnum(StoreOrderStatus)
  status?: StoreOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentId?: string;
}
