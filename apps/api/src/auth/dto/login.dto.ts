import { Transform, type TransformFnParams } from 'class-transformer';
import { Matches, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown),
  )
  @Matches(/^[a-z0-9_]{3,32}$/, {
    message: '用户名只能包含 3–32 位字母、数字或下划线',
  })
  username!: string;

  @MinLength(10, { message: '密码至少需要 10 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: '密码必须同时包含字母和数字',
  })
  password!: string;
}
