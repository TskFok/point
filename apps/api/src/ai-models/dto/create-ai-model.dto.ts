import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class CreateAiModelDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  baseUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  apiKey!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isEnabled?: boolean;
}
