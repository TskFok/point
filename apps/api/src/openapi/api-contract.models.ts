import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCT_IMAGE_KEY_PATTERN } from '../products/dto/create-product.dto';

const int32 = {
  type: 'integer' as const,
  format: 'int32',
};

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
  @ApiProperty({ ...int32, minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ ...int32, minimum: 1, maximum: 100, example: 20 })
  pageSize!: number;

  @ApiProperty({ ...int32, minimum: 0, example: 42 })
  total!: number;

  @ApiProperty({ ...int32, minimum: 0, example: 3 })
  totalPages!: number;
}

export class PublicUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ enum: ['ADMIN', 'STUDENT'] })
  role!: 'ADMIN' | 'STUDENT';

  @ApiProperty({ ...int32, minimum: 0 })
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

  @ApiProperty({
    ...int32,
    minimum: 1,
    description: '访问令牌剩余有效秒数',
  })
  accessTokenExpiresIn!: number;

  @ApiProperty({ format: 'date-time' })
  refreshTokenExpiresAt!: string;
}

export class WebSessionResponseDto extends UserResponseDto {}

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

export class AdminDashboardDto {
  @ApiProperty({ ...int32, minimum: 0 })
  activeQuestionCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  todayAnswerCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  pendingOrderCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  activeProductCount!: number;
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

  @ApiProperty({ ...int32, minimum: 0, maximum: 5 })
  position!: number;

  @ApiProperty()
  isCorrect!: boolean;
}

export class CreateQuestionRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  stem!: string;

  @ApiProperty({ minLength: 1, maxLength: 5000 })
  explanation!: string;

  @ApiProperty({ ...int32, minimum: 1, maximum: 1000, default: 10 })
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

  @ApiPropertyOptional({ ...int32, minimum: 1, maximum: 1000 })
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

  @ApiProperty(int32)
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

  @ApiProperty(int32)
  basePoints!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  hasAttempts!: boolean;

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

  @ApiProperty(int32)
  position!: number;
}

export class LearnerQuestionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  stem!: string;

  @ApiProperty(int32)
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

  @ApiProperty({ ...int32, minimum: 0 })
  errorCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  pointsAwarded!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  balance!: number;
}

export class WrongQuestionItemDto {
  @ApiProperty({ type: () => LearnerQuestionDto })
  question!: LearnerQuestionDto;

  @ApiProperty({ ...int32, minimum: 1 })
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
  @ApiProperty({ ...int32, minimum: 0 })
  activeTotal!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  firstAnsweredCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  unansweredCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  pendingWrongCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  masteredWrongCount!: number;

  @ApiProperty({ ...int32, minimum: 0 })
  balance!: number;
}

export class PointBalanceDto {
  @ApiProperty({ ...int32, minimum: 0 })
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

  @ApiProperty({ ...int32, minimum: 1, maximum: 10 })
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

export class PointConfigListResponseDto {
  @ApiProperty({ type: () => [PointConfigDto] })
  data!: PointConfigDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class UpdatePointConfigRequestDto {
  @ApiProperty({ ...int32, minimum: 1, maximum: 10 })
  multiplier!: number;
}

export class PointLedgerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ['ANSWER_REWARD', 'ORDER_REDEEM', 'ORDER_REFUND'] })
  type!: 'ANSWER_REWARD' | 'ORDER_REDEEM' | 'ORDER_REFUND';

  @ApiProperty(int32)
  delta!: number;

  @ApiProperty({ ...int32, minimum: 0 })
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
    pattern: PRODUCT_IMAGE_KEY_PATTERN.source,
  })
  imageKey!: string;

  @ApiProperty({ ...int32, minimum: 0, maximum: 2_147_483_647 })
  stock!: number;

  @ApiProperty({ ...int32, minimum: 0, maximum: 2_147_483_647 })
  pointsCost!: number;

  @ApiPropertyOptional()
  isActive?: boolean;
}

export class UpdateProductRequestDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 5000 })
  description?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    pattern: PRODUCT_IMAGE_KEY_PATTERN.source,
  })
  imageKey?: string;

  @ApiPropertyOptional({
    ...int32,
    minimum: 0,
    maximum: 2_147_483_647,
  })
  stock?: number;

  @ApiPropertyOptional({
    ...int32,
    minimum: 0,
    maximum: 2_147_483_647,
  })
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

  @ApiProperty({ ...int32, minimum: 0 })
  stock!: number;

  @ApiProperty({ ...int32, minimum: 0 })
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

  @ApiProperty({ ...int32, minimum: 1 })
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

  @ApiProperty({ ...int32, minimum: 0 })
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

export class CreateAiModelRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  baseUrl!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  apiKey!: string;

  @ApiPropertyOptional()
  isEnabled?: boolean;
}

export class UpdateAiModelRequestDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  name?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  baseUrl?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  apiKey?: string;

  @ApiPropertyOptional()
  isEnabled?: boolean;
}

export class TestAiModelDraftRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  baseUrl!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  apiKey?: string;

  @ApiPropertyOptional({ minLength: 1 })
  id?: string;
}

export class AiModelConfigDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  baseUrl!: string;

  @ApiProperty({ example: '••••abcd' })
  apiKeyMasked!: string;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AiModelConfigListResponseDto {
  @ApiProperty({ type: () => [AiModelConfigDto] })
  data!: AiModelConfigDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class AiModelProbeResultDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ ...int32, minimum: 0 })
  latencyMs!: number;

  @ApiPropertyOptional({ ...int32, minimum: 0 })
  modelCount?: number;

  @ApiPropertyOptional()
  message?: string;
}

export class AiTaskLatestRunDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['RUNNING', 'SUCCESS', 'FAILED'] })
  status!: 'RUNNING' | 'SUCCESS' | 'FAILED';

  @ApiProperty({ enum: ['CRON', 'MANUAL'] })
  trigger!: 'CRON' | 'MANUAL';

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ ...int32, minimum: 0 })
  questionsCreated!: number;
}

export class AiTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  aiModelConfigId!: string;

  @ApiProperty()
  aiModelName!: string;

  @ApiProperty({ ...int32, minimum: 1, maximum: 50 })
  questionCount!: number;

  @ApiProperty({ ...int32, minimum: 2, maximum: 6 })
  optionCount!: number;

  @ApiProperty({ ...int32, minimum: 1, maximum: 1000 })
  basePoints!: number;

  @ApiProperty()
  cronExpression!: string;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastWord!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: () => AiTaskLatestRunDto, nullable: true })
  latestRun?: AiTaskLatestRunDto | null;
}

export class AiTaskListResponseDto {
  @ApiProperty({ type: () => [AiTaskDto] })
  data!: AiTaskDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

export class CreateAiTaskRequestDto {
  @ApiProperty({ maxLength: 100 })
  name!: string;

  @ApiProperty()
  aiModelConfigId!: string;

  @ApiProperty({ ...int32, minimum: 1, maximum: 50 })
  questionCount!: number;

  @ApiProperty({ ...int32, minimum: 2, maximum: 6 })
  optionCount!: number;

  @ApiProperty({ ...int32, minimum: 1, maximum: 1000 })
  basePoints!: number;

  @ApiProperty({ maxLength: 100, example: '0 8 * * *' })
  cronExpression!: string;

  @ApiPropertyOptional()
  isEnabled?: boolean;
}

export class UpdateAiTaskRequestDto {
  @ApiPropertyOptional({ maxLength: 100 })
  name?: string;

  @ApiPropertyOptional()
  aiModelConfigId?: string;

  @ApiPropertyOptional({ ...int32, minimum: 1, maximum: 50 })
  questionCount?: number;

  @ApiPropertyOptional({ ...int32, minimum: 2, maximum: 6 })
  optionCount?: number;

  @ApiPropertyOptional({ ...int32, minimum: 1, maximum: 1000 })
  basePoints?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  cronExpression?: string;

  @ApiPropertyOptional()
  isEnabled?: boolean;
}

export class AiTaskRunDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  aiTaskId!: string;

  @ApiProperty({ enum: ['CRON', 'MANUAL'] })
  trigger!: 'CRON' | 'MANUAL';

  @ApiProperty({ enum: ['RUNNING', 'SUCCESS', 'FAILED'] })
  status!: 'RUNNING' | 'SUCCESS' | 'FAILED';

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ ...int32, minimum: 0 })
  questionsCreated!: number;

  @ApiPropertyOptional({ nullable: true })
  lastWordBefore!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastWordAfter!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;
}

export class AiTaskRunListResponseDto {
  @ApiProperty({ type: () => [AiTaskRunDto] })
  data!: AiTaskRunDto[];

  @ApiProperty({ type: () => PageMetaDto })
  meta!: PageMetaDto;
}

