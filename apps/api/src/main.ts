import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApiApp } from './common/http/configure-api-app';
import { readRuntimeConfig } from './config/runtime-config';

async function bootstrap() {
  const config = readRuntimeConfig();
  const app = await NestFactory.create(AppModule);

  configureApiApp(app, config.webOrigin);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
