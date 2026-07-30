import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import {
  ApiContract,
  pageQueries,
  questionIdParam,
} from '../openapi/api-contract.decorator';
import {
  AnswerQuestionRequestDto,
  AnswerResultDto,
  LearnerQuestionDto,
  PracticeSummaryDto,
  WrongQuestionListResponseDto,
} from '../openapi/api-contract.models';
import { AnswerQuestionDto } from './dto/answer-question.dto';
import { ListWrongQuestionsDto } from './dto/list-wrong-questions.dto';
import { RandomQuestionQueryDto } from './dto/random-question-query.dto';
import { PracticeService } from './practice.service';

@Controller('practice')
@Roles('STUDENT')
@ApiTags('学生端-练习')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Get('random')
  @ApiContract({
    operationId: 'practiceGetRandomQuestion',
    summary: '随机获取一题未答题目',
    responseType: LearnerQuestionDto,
    authenticated: true,
    queries: [
      {
        name: 'excludeIds',
        required: false,
        schema: { type: 'string' },
        description: '本次客户端会话需排除的题目 ID，使用逗号分隔，最多 50 个',
      },
    ],
  })
  random(
    @CurrentUser() user: RequestUser,
    @Query() query: RandomQuestionQueryDto,
  ) {
    return this.practiceService.getRandomQuestion(user.id, query.excludeIds);
  }

  @Post('questions/:questionId/answer')
  @ApiContract({
    operationId: 'practiceAnswerQuestion',
    summary: '提交题目首次答案',
    responseType: AnswerResultDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    idempotent: true,
    bodyType: AnswerQuestionRequestDto,
    params: [questionIdParam],
  })
  answer(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: AnswerQuestionDto,
  ) {
    return this.practiceService.answerFirst(
      user.id,
      questionId,
      body.selectedOptionId,
      idempotencyKey,
    );
  }

  @Get('wrong-questions')
  @ApiContract({
    operationId: 'practiceListWrongQuestions',
    summary: '分页查询待练错题',
    responseType: WrongQuestionListResponseDto,
    authenticated: true,
    queries: pageQueries,
  })
  wrongQuestions(
    @CurrentUser() user: RequestUser,
    @Query() query: ListWrongQuestionsDto,
  ) {
    return this.practiceService.listWrongQuestions(user.id, query);
  }

  @Post('wrong-questions/:questionId/answer')
  @ApiContract({
    operationId: 'practiceRetryWrongQuestion',
    summary: '提交错题重练答案',
    responseType: AnswerResultDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    idempotent: true,
    bodyType: AnswerQuestionRequestDto,
    params: [questionIdParam],
  })
  retryWrongQuestion(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: AnswerQuestionDto,
  ) {
    return this.practiceService.answerWrongRetry(
      user.id,
      questionId,
      body.selectedOptionId,
      idempotencyKey,
    );
  }

  @Get('summary')
  @ApiContract({
    operationId: 'practiceGetSummary',
    summary: '获取练习统计摘要',
    responseType: PracticeSummaryDto,
    authenticated: true,
  })
  summary(@CurrentUser() user: RequestUser) {
    return this.practiceService.getSummary(user.id);
  }
}
