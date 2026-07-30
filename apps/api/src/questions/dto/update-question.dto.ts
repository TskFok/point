import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionOptionWriteDto } from './create-question.dto';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

export class UpdateQuestionDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  stem?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  explanation?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  basePoints?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ArrayUnique((option: QuestionOptionWriteDto) => option.label)
  @ArrayUnique((option: QuestionOptionWriteDto) => option.position)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionWriteDto)
  options?: QuestionOptionWriteDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
