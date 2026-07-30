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
    .addCookieAuth(
      'pq_refresh',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'Web 刷新与注销流程使用的 HttpOnly Refresh Token Cookie',
      },
      'refreshCookieAuth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });
  const schemas = document.components?.schemas;
  if (schemas) {
    for (const name of [
      'UpdateQuestionRequestDto',
      'UpdateProductRequestDto',
    ]) {
      const schema = schemas[name];
      if (schema && !('$ref' in schema)) {
        schema.minProperties = 1;
      }
    }
  }
  return document;
}
