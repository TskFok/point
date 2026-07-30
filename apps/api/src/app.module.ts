import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PointsModule } from './points/points.module';
import { PracticeModule } from './practice/practice.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuestionsModule } from './questions/questions.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    QuestionsModule,
    PointsModule,
    PracticeModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
