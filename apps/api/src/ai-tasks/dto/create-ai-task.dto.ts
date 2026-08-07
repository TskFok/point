import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { LANG_CODES } from '../../common/lang-code';
import { WordMatchRulesDto } from './word-match-rules.dto';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class CreateAiTaskDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  aiModelConfigId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  questionCount!: number;

  @IsInt()
  @Min(2)
  @Max(6)
  optionCount!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  basePoints!: number;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cronExpression!: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxConsecutiveFailures?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => WordMatchRulesDto)
  wordMatchRules?: WordMatchRulesDto;

  @IsOptional()
  @IsString()
  @IsIn([...LANG_CODES])
  langCode?: string;
}
