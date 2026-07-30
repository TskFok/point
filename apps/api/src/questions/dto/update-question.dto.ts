import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QuestionOptionWriteDto } from './create-question.dto';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class UpdateQuestionDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  stem?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  explanation?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  basePoints?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ArrayUnique((option: QuestionOptionWriteDto) => option.label)
  @ArrayUnique((option: QuestionOptionWriteDto) => option.position)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionWriteDto)
  options?: QuestionOptionWriteDto[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
