import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApiApp } from './common/http/configure-api-app';
import { readRuntimeConfig } from './config/runtime-config';
import { configureLocalStaticFiles } from './storage/local-static-files';

async function bootstrap() {
  const config = readRuntimeConfig();
  const app = await NestFactory.create(AppModule);

  configureApiApp(app, config.webOrigin);
  configureLocalStaticFiles(app, process.env.PRODUCT_UPLOAD_ROOT);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
