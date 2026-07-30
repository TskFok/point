import { Module } from '@nestjs/common';
import { AdminPointsController } from './admin-points.controller';
import { PointsService } from './points.service';

@Module({
  controllers: [AdminPointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
