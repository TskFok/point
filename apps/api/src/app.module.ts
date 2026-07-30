import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { OrdersModule } from './orders/orders.module';
import { PointsModule } from './points/points.module';
import { PracticeModule } from './practice/practice.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { QuestionsModule } from './questions/questions.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    QuestionsModule,
    PointsModule,
    PracticeModule,
    ProductsModule,
    OrdersModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
