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
  AiModelConfigDto,
  AiModelConfigListResponseDto,
  AiModelProbeResultDto,
  CreateAiModelRequestDto,
  SuccessResponseDto,
  TestAiModelDraftRequestDto,
  UpdateAiModelRequestDto,
} from '../openapi/api-contract.models';
import {
  ApiContract,
  aiModelIdParam,
  aiModelQueries,
} from '../openapi/api-contract.decorator';
import { AiModelsService } from './ai-models.service';
import { CreateAiModelDto } from './dto/create-ai-model.dto';
import { ListAiModelsDto } from './dto/list-ai-models.dto';
import { TestAiModelDraftDto } from './dto/test-ai-model-draft.dto';
import { UpdateAiModelDto } from './dto/update-ai-model.dto';

@Controller('admin/ai-models')
@Roles('ADMIN')
@ApiTags('管理端-AI模型')
export class AdminAiModelsController {
  constructor(private readonly aiModelsService: AiModelsService) {}

  @Get()
  @ApiContract({
    operationId: 'adminListAiModels',
    summary: '分页查询 AI 模型配置',
    responseType: AiModelConfigListResponseDto,
    authenticated: true,
    queries: aiModelQueries,
  })
  list(@Query() query: ListAiModelsDto) {
    return this.aiModelsService.list(query);
  }

  @Post('test')
  @ApiContract({
    operationId: 'adminTestAiModelDraft',
    summary: '测试草稿或编辑态 AI 模型连通性',
    responseType: AiModelProbeResultDto,
    authenticated: true,
    mutation: true,
    bodyType: TestAiModelDraftRequestDto,
  })
  testDraft(@Body() body: TestAiModelDraftDto) {
    return this.aiModelsService.testDraft(body);
  }

  @Post()
  @ApiContract({
    operationId: 'adminCreateAiModel',
    summary: '创建 AI 模型配置',
    responseType: AiModelConfigDto,
    authenticated: true,
    mutation: true,
    bodyType: CreateAiModelRequestDto,
  })
  create(
    @Body() body: CreateAiModelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiModelsService.create(body, user.id);
  }

  @Get(':id')
  @ApiContract({
    operationId: 'adminGetAiModel',
    summary: '获取 AI 模型配置详情',
    responseType: AiModelConfigDto,
    authenticated: true,
    params: [aiModelIdParam],
  })
  get(@Param('id') id: string) {
    return this.aiModelsService.get(id);
  }

  @Patch(':id')
  @ApiContract({
    operationId: 'adminUpdateAiModel',
    summary: '更新 AI 模型配置',
    responseType: AiModelConfigDto,
    authenticated: true,
    mutation: true,
    bodyType: UpdateAiModelRequestDto,
    params: [aiModelIdParam],
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateAiModelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.aiModelsService.update(id, body, user.id);
  }

  @Delete(':id')
  @ApiContract({
    operationId: 'adminDeleteAiModel',
    summary: '删除 AI 模型配置',
    responseType: SuccessResponseDto,
    authenticated: true,
    mutation: true,
    params: [aiModelIdParam],
  })
  remove(@Param('id') id: string) {
    return this.aiModelsService.remove(id);
  }

  @Post(':id/test')
  @ApiContract({
    operationId: 'adminTestAiModel',
    summary: '测试已保存 AI 模型连通性',
    responseType: AiModelProbeResultDto,
    authenticated: true,
    mutation: true,
    params: [aiModelIdParam],
  })
  testById(@Param('id') id: string) {
    return this.aiModelsService.testById(id);
  }
}
