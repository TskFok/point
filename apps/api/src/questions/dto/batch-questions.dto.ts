import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  Length,
} from 'class-validator';

export const BATCH_QUESTION_ACTIONS = ['enable', 'disable', 'delete'] as const;
export type BatchQuestionAction = (typeof BATCH_QUESTION_ACTIONS)[number];

export class BatchQuestionsDto {
  @IsIn(BATCH_QUESTION_ACTIONS)
  action!: BatchQuestionAction;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 191, { each: true })
  ids!: string[];
}
