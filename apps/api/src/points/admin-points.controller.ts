import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { ApiContract, pageQueries } from '../openapi/api-contract.decorator';
import {
  PointConfigDto,
  PointConfigListResponseDto,
  UpdatePointConfigRequestDto,
} from '../openapi/api-contract.models';
import { ListPointConfigHistoryDto } from './dto/list-point-config-history.dto';
import { UpdatePointConfigDto } from './dto/update-point-config.dto';
import { PointsService } from './points.service';

@Controller('admin/points')
@Roles('ADMIN')
@ApiTags('管理端-积分')
export class AdminPointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('config')
  @ApiContract({
    operationId: 'adminGetPointConfig',
    summary: '获取当前积分倍率',
    responseType: PointConfigDto,
    authenticated: true,
  })
  getConfig() {
    return this.pointsService.getCurrentConfig();
  }

  @Get('config/history')
  @ApiContract({
    operationId: 'adminListPointConfigHistory',
    summary: '分页查询积分倍率配置历史',
    responseType: PointConfigListResponseDto,
    authenticated: true,
    queries: pageQueries,
  })
  listConfigHistory(@Query() query: ListPointConfigHistoryDto) {
    return this.pointsService.listConfigHistory(query.page, query.pageSize);
  }

  @Put('config')
  @ApiContract({
    operationId: 'adminUpdatePointConfig',
    summary: '追加新的积分倍率配置',
    responseType: PointConfigDto,
    authenticated: true,
    mutation: true,
    bodyType: UpdatePointConfigRequestDto,
  })
  updateConfig(
    @Body() body: UpdatePointConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pointsService.updateMultiplier(body.multiplier, user.id);
  }
}
