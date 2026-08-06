import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import {
  ApiContract,
  questionIdParam,
  questionQueries,
} from '../openapi/api-contract.decorator';
import {
  AdminQuestionDto,
  BatchQuestionsRequestDto,
  BatchQuestionsResponseDto,
  CreateQuestionRequestDto,
  QuestionListResponseDto,
  SuccessResponseDto,
  UpdateQuestionRequestDto,
} from '../openapi/api-contract.models';
import { BatchQuestionsDto } from './dto/batch-questions.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ListQuestionsDto } from './dto/list-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

@Controller('admin/questions')
@Roles('ADMIN')
@ApiTags('管理端-题库')
export class AdminQuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  @ApiContract({
    operationId: 'adminListQuestions',
    summary: '分页查询题库',
    responseType: QuestionListResponseDto,
    authenticated: true,
    queries: questionQueries,
  })
  list(@Query() query: ListQuestionsDto) {
    return this.questionsService.list(query);
  }

  @Post()
  @ApiContract({
    operationId: 'adminCreateQuestion',
    summary: '创建英语选择题',
    responseType: AdminQuestionDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    bodyType: CreateQuestionRequestDto,
  })
  create(@Body() body: CreateQuestionDto, @CurrentUser() user: RequestUser) {
    return this.questionsService.create(body, user.id);
  }

  @Post('batch')
  @HttpCode(200)
  @ApiContract({
    operationId: 'adminBatchQuestions',
    summary: '批量启用、停用或删除题目',
    responseType: BatchQuestionsResponseDto,
    responseStatus: 200,
    authenticated: true,
    mutation: true,
    bodyType: BatchQuestionsRequestDto,
  })
  batch(@Body() body: BatchQuestionsDto) {
    return this.questionsService.batch(body);
  }

  @Get(':questionId')
  @ApiContract({
    operationId: 'adminGetQuestion',
    summary: '获取题目详情',
    responseType: AdminQuestionDto,
    authenticated: true,
    params: [questionIdParam],
  })
  get(@Param('questionId') questionId: string) {
    return this.questionsService.get(questionId);
  }

  @Patch(':questionId')
  @ApiContract({
    operationId: 'adminUpdateQuestion',
    summary: '更新或停用题目',
    responseType: AdminQuestionDto,
    authenticated: true,
    mutation: true,
    bodyType: UpdateQuestionRequestDto,
    params: [questionIdParam],
  })
  update(
    @Param('questionId') questionId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.questionsService.update(questionId, body);
  }

  @Delete(':questionId')
  @ApiContract({
    operationId: 'adminDeleteQuestion',
    summary: '删除已停用且无答题记录的题目',
    responseType: SuccessResponseDto,
    authenticated: true,
    mutation: true,
    params: [questionIdParam],
  })
  remove(@Param('questionId') questionId: string) {
    return this.questionsService.remove(questionId);
  }
}
