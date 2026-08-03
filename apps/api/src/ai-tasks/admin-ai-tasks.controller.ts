import {
  Body,
  Controller,
  Delete,
  Get,
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
  AiTaskDto,
  AiTaskListResponseDto,
  AiTaskRunDto,
  AiTaskRunListResponseDto,
  CreateAiTaskRequestDto,
  SuccessResponseDto,
  UpdateAiTaskRequestDto,
} from '../openapi/api-contract.models';
import {
  ApiContract,
  aiTaskIdParam,
  aiTaskQueries,
  pageQueries,
} from '../openapi/api-contract.decorator';
import { AiTasksService } from './ai-tasks.service';
import { CreateAiTaskDto } from './dto/create-ai-task.dto';
import { ListAiTaskRunsDto } from './dto/list-ai-task-runs.dto';
import { ListAiTasksDto } from './dto/list-ai-tasks.dto';
import { UpdateAiTaskDto } from './dto/update-ai-task.dto';

@Controller('admin/ai-tasks')
@Roles('ADMIN')
@ApiTags('管理端-AI任务')
export class AdminAiTasksController {
  constructor(private readonly aiTasksService: AiTasksService) {}

  @Get()
  @ApiContract({
    operationId: 'adminListAiTasks',
    summary: '分页查询 AI 出题任务',
    responseType: AiTaskListResponseDto,
    authenticated: true,
    queries: aiTaskQueries,
  })
  list(@Query() query: ListAiTasksDto) {
    return this.aiTasksService.list(query);
  }

  @Post()
  @ApiContract({
    operationId: 'adminCreateAiTask',
    summary: '创建 AI 出题任务',
    responseType: AiTaskDto,
    authenticated: true,
    mutation: true,
    bodyType: CreateAiTaskRequestDto,
  })
  create(
    @Body() body: CreateAiTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiTasksService.create(body, user.id);
  }

  @Get(':id')
  @ApiContract({
    operationId: 'adminGetAiTask',
    summary: '获取 AI 出题任务详情',
    responseType: AiTaskDto,
    authenticated: true,
    params: [aiTaskIdParam],
  })
  get(@Param('id') id: string) {
    return this.aiTasksService.get(id);
  }

  @Patch(':id')
  @ApiContract({
    operationId: 'adminUpdateAiTask',
    summary: '更新 AI 出题任务',
    responseType: AiTaskDto,
    authenticated: true,
    mutation: true,
    bodyType: UpdateAiTaskRequestDto,
    params: [aiTaskIdParam],
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateAiTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiTasksService.update(id, body, user.id);
  }

  @Delete(':id')
  @ApiContract({
    operationId: 'adminDeleteAiTask',
    summary: '删除 AI 出题任务',
    responseType: SuccessResponseDto,
    authenticated: true,
    mutation: true,
    params: [aiTaskIdParam],
  })
  remove(@Param('id') id: string) {
    return this.aiTasksService.remove(id);
  }

  @Post(':id/run')
  @ApiContract({
    operationId: 'adminRunAiTask',
    summary: '立即执行 AI 出题任务',
    responseType: AiTaskRunDto,
    authenticated: true,
    mutation: true,
    params: [aiTaskIdParam],
  })
  run(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.aiTasksService.runTask(id, {
      trigger: 'MANUAL',
      actorUserId: user.id,
    });
  }

  @Get(':id/runs')
  @ApiContract({
    operationId: 'adminListAiTaskRuns',
    summary: '分页查询 AI 出题任务执行记录',
    responseType: AiTaskRunListResponseDto,
    authenticated: true,
    params: [aiTaskIdParam],
    queries: pageQueries,
  })
  listRuns(@Param('id') id: string, @Query() query: ListAiTaskRunsDto) {
    return this.aiTasksService.listRuns(id, query);
  }
}
