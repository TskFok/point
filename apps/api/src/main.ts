import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { bootstrapAdminIfNeeded } from './auth/bootstrap-admin';
import { configureApiApp } from './common/http/configure-api-app';
import { readRuntimeConfig } from './config/runtime-config';
import { createOpenApiDocument } from './openapi/create-openapi-document';
import { PrismaService } from './prisma/prisma.service';
import { configureLocalStaticFiles } from './storage/local-static-files';

async function bootstrap() {
  const config = readRuntimeConfig();
  const app = await NestFactory.create(AppModule);

  configureApiApp(app, config.webOrigin);
  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
  await configureLocalStaticFiles(app, process.env.PRODUCT_UPLOAD_ROOT);
  await bootstrapAdminIfNeeded(app.get(PrismaService));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
