import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { AnswerQuestionDto } from './dto/answer-question.dto';
import { RandomQuestionQueryDto } from './dto/random-question-query.dto';
import { PracticeService } from './practice.service';

@Controller('practice')
@Roles('STUDENT')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Get('random')
  random(
    @CurrentUser() user: RequestUser,
    @Query() query: RandomQuestionQueryDto,
  ) {
    return this.practiceService.getRandomQuestion(user.id, query.excludeIds);
  }

  @Post('questions/:questionId/answer')
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

  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.practiceService.getSummary(user.id);
  }
}
