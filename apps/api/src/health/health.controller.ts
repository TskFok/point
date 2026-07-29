import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' as const, service: 'point-quest-api' as const };
  }
}
