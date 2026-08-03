import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class UpdateAiTaskDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  aiModelConfigId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(50)
  questionCount?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(2)
  @Max(6)
  optionCount?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  basePoints?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cronExpression?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isEnabled?: boolean;
}
