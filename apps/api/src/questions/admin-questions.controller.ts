import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ListQuestionsDto } from './dto/list-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

@Controller('admin/questions')
@Roles('ADMIN')
export class AdminQuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  list(@Query() query: ListQuestionsDto) {
    return this.questionsService.list(query);
  }

  @Post()
  create(@Body() body: CreateQuestionDto, @CurrentUser() user: RequestUser) {
    return this.questionsService.create(body, user.id);
  }

  @Get(':questionId')
  get(@Param('questionId') questionId: string) {
    return this.questionsService.get(questionId);
  }

  @Patch(':questionId')
  update(
    @Param('questionId') questionId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.questionsService.update(questionId, body);
  }
}
