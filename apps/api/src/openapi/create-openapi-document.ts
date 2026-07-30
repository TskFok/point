import { type INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Point Quest API')
    .setDescription('英语答题、积分、商品兑换与订单管理开放接口')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Android 与其他无 Cookie 客户端使用的访问令牌',
      },
      'bearerAuth',
    )
    .addCookieAuth(
      'pq_access',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'Web 客户端访问令牌 Cookie',
      },
      'cookieAuth',
    )
    .build();

  return SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });
}
