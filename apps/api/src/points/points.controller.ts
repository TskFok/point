import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
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
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('balance')
  getBalance(@CurrentUser() user: RequestUser) {
    return this.pointsService.getBalance(user.id);
  }

  @Get('ledger')
  listLedger(
    @CurrentUser() user: RequestUser,
    @Query() query: ListPointLedgerQueryDto,
  ) {
    return this.pointsService.listLedger(user.id, query.page, query.pageSize);
  }
}
