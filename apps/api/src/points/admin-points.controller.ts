import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { UpdatePointConfigDto } from './dto/update-point-config.dto';
import { PointsService } from './points.service';

@Controller('admin/points')
@Roles('ADMIN')
export class AdminPointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('config')
  getConfig() {
    return this.pointsService.getCurrentConfig();
  }

  @Put('config')
  updateConfig(
    @Body() body: UpdatePointConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pointsService.updateMultiplier(body.multiplier, user.id);
  }
}
