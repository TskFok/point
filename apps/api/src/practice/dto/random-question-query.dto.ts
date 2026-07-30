import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
} from 'class-validator';

export class RandomQuestionQueryDto {
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === '') {
      return [];
    }
    if (typeof value !== 'string') {
      return value;
    }
    return value.split(',').map((id) => id.trim());
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 191, { each: true })
  excludeIds: string[] = [];
}
