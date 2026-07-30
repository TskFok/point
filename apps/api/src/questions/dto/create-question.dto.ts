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
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

function trimText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : (value as unknown);
}

@ValidatorConstraint({ name: 'exactlyOneCorrectOption', async: false })
class ExactlyOneCorrectOptionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.filter(
        (option: unknown) =>
          typeof option === 'object' &&
          option !== null &&
          'isCorrect' in option &&
          option.isCorrect === true,
      ).length === 1
    );
  }

  defaultMessage(): string {
    return '题目必须且只能有一个正确选项';
  }
}

export class QuestionOptionWriteDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  label!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content!: string;

  @IsInt()
  @Min(0)
  @Max(5)
  position!: number;

  @IsBoolean()
  isCorrect!: boolean;
}

export class QuestionWriteDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  stem!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  explanation!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  basePoints!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ArrayUnique((option: QuestionOptionWriteDto) => option.label)
  @ArrayUnique((option: QuestionOptionWriteDto) => option.position)
  @Validate(ExactlyOneCorrectOptionConstraint)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionWriteDto)
  options!: QuestionOptionWriteDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateQuestionDto extends QuestionWriteDto {}
