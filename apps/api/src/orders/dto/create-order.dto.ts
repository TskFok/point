import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class CreateOrderDto {
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  productId!: string;
}
