import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiContract } from '../openapi/api-contract.decorator';
import { AdminDashboardDto } from '../openapi/api-contract.models';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@Roles('ADMIN')
@ApiTags('管理端-概览')
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get()
  @ApiContract({
    operationId: 'adminGetDashboard',
    summary: '获取管理员运营概览',
    responseType: AdminDashboardDto,
    authenticated: true,
  })
  getDashboard() {
    return this.adminDashboardService.getDashboard();
  }
}
