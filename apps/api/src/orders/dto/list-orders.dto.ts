import { OrderStatus } from '@prisma/client';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class ListOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ListAdminOrdersDto extends ListOrdersDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  orderNo?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @Transform(trimText)
  @IsDateString({ strict: true })
  createdFrom?: string;

  @IsOptional()
  @Transform(trimText)
  @IsDateString({ strict: true })
  createdTo?: string;
}
