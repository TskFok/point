import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class WordMatchRulesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suffixes?: string[];

  @IsOptional()
  @IsObject()
  irregulars?: Record<string, string[]>;
}
