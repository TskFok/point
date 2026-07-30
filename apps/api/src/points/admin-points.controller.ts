import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { ApiContract } from '../openapi/api-contract.decorator';
import {
  PointConfigDto,
  UpdatePointConfigRequestDto,
} from '../openapi/api-contract.models';
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
