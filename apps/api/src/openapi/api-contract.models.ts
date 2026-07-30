import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiProperty({ example: '请求参数验证失败' })
  message!: string;

  @ApiProperty({ example: '7da2aa93-ef82-45c8-9df0-84232e6a5b13' })
  requestId!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  details!: Record<string, unknown>;
}

export class PageMetaDto {
  @ApiProperty({ minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100, example: 20 })
  pageSize!: number;

  @ApiProperty({ minimum: 0, example: 42 })
  total!: number;

  @ApiProperty({ minimum: 0, example: 3 })
  totalPages!: number;
}

export class PublicUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ enum: ['ADMIN', 'STUDENT'] })
  role!: 'ADMIN' | 'STUDENT';

  @ApiProperty({ minimum: 0 })
  pointsBalance!: number;
}

export class UserResponseDto {
  @ApiProperty({ type: () => PublicUserDto })
  user!: PublicUserDto;
}

export class TokenResponseDto extends UserResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ minimum: 1, description: '访问令牌剩余有效秒数' })
  accessTokenExpiresIn!: number;

  @ApiProperty({ format: 'date-time' })
  refreshTokenExpiresAt!: string;
}

export class RefreshResponseDto extends UserResponseDto {
  @ApiPropertyOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  refreshToken?: string;

  @ApiPropertyOptional({ minimum: 1, description: '访问令牌剩余有效秒数' })
  accessTokenExpiresIn?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  refreshTokenExpiresAt?: string;
}

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['point-quest-api'] })
  service!: 'point-quest-api';
}

export class LoginRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 32, example: 'student_01' })
  username!: string;

  @ApiProperty({ minLength: 1, maxLength: 128, format: 'password' })
  password!: string;
}

export class RegisterRequestDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 32,
    pattern: '^[a-z0-9_]{3,32}$',
    example: 'student_01',
  })
  username!: string;

  @ApiProperty({
    minLength: 10,
    format: 'password',
    description: '必须同时包含字母和数字',
  })
  password!: string;
}

export class RefreshRequestDto {
  @ApiPropertyOptional({
    minLength: 32,
    description: 'Android 必填；Web 可使用 pq_refresh Cookie',
  })
  refreshToken?: string;
}

export class QuestionOptionWriteRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 16, example: 'A' })
  label!: string;

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  content!: string;

  @ApiProperty({ minimum: 0, maximum: 5 })
  position!: number;

  @ApiProperty()
  isCorrect!: boolean;
}

export class CreateQuestionRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  stem!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  explanation!: string;

  @ApiProperty({ minimum: 1, maximum: 1000, default: 10 })
  basePoints!: number;

  @ApiProperty({
    type: () => [QuestionOptionWriteRequestDto],
    minItems: 2,
    maxItems: 6,
    description: '标签与位置不可重复，且必须恰好有一个正确选项',
  })
  options!: QuestionOptionWriteRequestDto[];

  @ApiPropertyOptional()
  isActive?: boolean;
}

export class UpdateQuestionRequestDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 2000 })
  stem?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 5000 })
  explanation?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  basePoints?: number;

  @ApiPropertyOptional({
    type: () => [QuestionOptionWriteRequestDto],
    minItems: 2,
    maxItems: 6,
    description: '标签与位置不可重复，且必须恰好有一个正确选项',
  })
  options?: QuestionOptionWriteRequestDto[];

  @ApiPropertyOptional()
  isActive?: boolean;
}

export class AdminQuestionOptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  questionId!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  isCorrect!: boolean;
}

export class AdminQuestionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  stem!: string;

  @ApiProperty()
  explanation!: string;

  @ApiProperty()
  basePoints!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: () => [AdminQuestionOptionDto] })
  options!: AdminQuestionOptionDto[];
}

export class QuestionListResponseDto {
  @ApiProperty({ type: () => [AdminQuestionDto] })
  data!: AdminQuestionDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class LearnerQuestionOptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  position!: number;
}

export class LearnerQuestionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  stem!: string;

  @ApiProperty()
  basePoints!: number;

  @ApiProperty({ type: () => [LearnerQuestionOptionDto] })
  options!: LearnerQuestionOptionDto[];
}

export class AnswerQuestionRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 191 })
  selectedOptionId!: string;
}

export class AnswerResultDto {
  @ApiProperty()
  correct!: boolean;

  @ApiProperty()
  selectedOptionId!: string;

  @ApiProperty()
  correctOptionId!: string;

  @ApiProperty()
  explanation!: string;

  @ApiProperty({ minimum: 0 })
  errorCount!: number;

  @ApiProperty({ minimum: 0 })
  pointsAwarded!: number;

  @ApiProperty({ minimum: 0 })
  balance!: number;
}

export class WrongQuestionItemDto {
  @ApiProperty({ type: () => LearnerQuestionDto })
  question!: LearnerQuestionDto;

  @ApiProperty({ minimum: 1 })
  errorCount!: number;

  @ApiProperty({ format: 'date-time' })
  firstAnsweredAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  masteredAt!: string | null;
}

export class WrongQuestionListResponseDto {
  @ApiProperty({ type: () => [WrongQuestionItemDto] })
  data!: WrongQuestionItemDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class PracticeSummaryDto {
  @ApiProperty({ minimum: 0 })
  activeTotal!: number;

  @ApiProperty({ minimum: 0 })
  firstAnsweredCount!: number;

  @ApiProperty({ minimum: 0 })
  unansweredCount!: number;

  @ApiProperty({ minimum: 0 })
  pendingWrongCount!: number;

  @ApiProperty({ minimum: 0 })
  masteredWrongCount!: number;

  @ApiProperty({ minimum: 0 })
  balance!: number;
}

export class PointBalanceDto {
  @ApiProperty({ minimum: 0 })
  balance!: number;
}

export class PointConfigUpdaterDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;
}

export class PointConfigDto {
  @ApiProperty({ type: String, nullable: true })
  id!: string | null;

  @ApiProperty({ minimum: 1, maximum: 10 })
  multiplier!: number;

  @ApiProperty({ type: String, nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: string | null;

  @ApiProperty({
    type: () => PointConfigUpdaterDto,
    nullable: true,
  })
  updater!: PointConfigUpdaterDto | null;
}

export class UpdatePointConfigRequestDto {
  @ApiProperty({ minimum: 1, maximum: 10 })
  multiplier!: number;
}

export class PointLedgerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ['ANSWER_REWARD', 'ORDER_REDEEM', 'ORDER_REFUND'] })
  type!: 'ANSWER_REWARD' | 'ORDER_REDEEM' | 'ORDER_REFUND';

  @ApiProperty()
  delta!: number;

  @ApiProperty({ minimum: 0 })
  balanceAfter!: number;

  @ApiProperty({ type: String, nullable: true })
  answerAttemptId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  orderId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class PointLedgerListResponseDto {
  @ApiProperty({ type: () => [PointLedgerDto] })
  data!: PointLedgerDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class CreateProductRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  description!: string;

  @ApiProperty({
    maxLength: 200,
    pattern:
      '^products/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp)$',
  })
  imageKey!: string;

  @ApiProperty({ minimum: 0, maximum: 2_147_483_647 })
  stock!: number;

  @ApiProperty({ minimum: 0, maximum: 2_147_483_647 })
  pointsCost!: number;

  @ApiPropertyOptional()
  isActive?: boolean;
}

export class UpdateProductRequestDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 5000 })
  description?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  imageKey?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 2_147_483_647 })
  stock?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 2_147_483_647 })
  pointsCost?: number;

  @ApiPropertyOptional()
  isActive?: boolean;
}

export class ProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  imageKey!: string;

  @ApiProperty({ minimum: 0 })
  stock!: number;

  @ApiProperty({ minimum: 0 })
  pointsCost!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ProductListResponseDto {
  @ApiProperty({ type: () => [ProductDto] })
  data!: ProductDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class ProductImageUploadResponseDto {
  @ApiProperty({ example: 'products/550e8400-e29b-41d4-a716-446655440000.png' })
  key!: string;

  @ApiProperty({
    example: '/uploads/products/550e8400-e29b-41d4-a716-446655440000.png',
  })
  url!: string;
}

export class CreateOrderRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 191 })
  productId!: string;
}

export class OrderDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderNo!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  productId!: string;

  @ApiProperty()
  productNameSnapshot!: string;

  @ApiProperty()
  productImageKeySnapshot!: string;

  @ApiProperty({ minimum: 1 })
  pointsCostSnapshot!: number;

  @ApiProperty({ enum: ['PENDING_PICKUP', 'COMPLETED', 'CANCELLED'] })
  status!: 'PENDING_PICKUP' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ minimum: 0 })
  balance!: number;
}

export class OrderUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;
}

export class AdminOrderDto extends OrderDto {
  @ApiProperty({ type: () => OrderUserDto })
  user!: OrderUserDto;
}

export class OrderListResponseDto {
  @ApiProperty({ type: () => [OrderDto] })
  data!: OrderDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class AdminOrderListResponseDto {
  @ApiProperty({ type: () => [AdminOrderDto] })
  data!: AdminOrderDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}
