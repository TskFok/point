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

export const POSTGRES_INTEGER_MAX = 2_147_483_647;
export const PRODUCT_IMAGE_KEY_PATTERN =
  /^products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class CreateProductDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @Transform(trimText)
  @IsString()
  @MaxLength(200)
  @Matches(PRODUCT_IMAGE_KEY_PATTERN)
  imageKey!: string;

  @IsInt()
  @Min(0)
  @Max(POSTGRES_INTEGER_MAX)
  stock!: number;

  @IsInt()
  @Min(0)
  @Max(POSTGRES_INTEGER_MAX)
  pointsCost!: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
