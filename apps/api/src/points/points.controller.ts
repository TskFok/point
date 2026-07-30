import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { ApiContract, pageQueries } from '../openapi/api-contract.decorator';
import {
  PointBalanceDto,
  PointLedgerListResponseDto,
} from '../openapi/api-contract.models';
import { PointsService } from './points.service';

class ListPointLedgerQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

@Controller('points')
@Roles('STUDENT')
@ApiTags('学生端-积分')
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('balance')
  @ApiContract({
    operationId: 'pointsGetBalance',
    summary: '获取当前积分余额',
    responseType: PointBalanceDto,
    authenticated: true,
  })
  getBalance(@CurrentUser() user: RequestUser) {
    return this.pointsService.getBalance(user.id);
  }

  @Get('ledger')
  @ApiContract({
    operationId: 'pointsListLedger',
    summary: '分页查询积分流水',
    responseType: PointLedgerListResponseDto,
    authenticated: true,
    queries: pageQueries,
  })
  listLedger(
    @CurrentUser() user: RequestUser,
    @Query() query: ListPointLedgerQueryDto,
  ) {
    return this.pointsService.listLedger(user.id, query.page, query.pageSize);
  }
}
