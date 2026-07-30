import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApiContract } from '../openapi/api-contract.decorator';
import { HealthResponseDto } from '../openapi/api-contract.models';

@Controller('health')
@Public()
@ApiTags('健康检查')
export class HealthController {
  @Get()
  @ApiContract({
    operationId: 'healthGet',
    summary: '检查 API 健康状态',
    responseType: HealthResponseDto,
  })
  getHealth() {
    return { status: 'ok' as const, service: 'point-quest-api' as const };
  }
}
