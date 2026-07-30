import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  POSTGRES_INTEGER_MAX,
  PRODUCT_IMAGE_KEY_PATTERN,
} from './create-product.dto';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class UpdateProductDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @MaxLength(200)
  @Matches(PRODUCT_IMAGE_KEY_PATTERN)
  imageKey?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INTEGER_MAX)
  stock?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INTEGER_MAX)
  pointsCost?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
